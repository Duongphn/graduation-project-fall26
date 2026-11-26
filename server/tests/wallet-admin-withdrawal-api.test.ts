import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuditLog, User, Wallet, WithdrawalRequest as WithdrawalModel } from '../src/models/index.js';
import type { WithdrawalRecord } from '../src/repositories/withdrawal.repository.js';
import { authHeader, createUser, fund } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

/** The model file has no document type */
const WithdrawalRequest = WithdrawalModel as unknown as Model<WithdrawalRecord>;

// Admin process withdrawal: the Admin pays a pending request out (escrow → external) or refuses it
// with a reason (escrow → back to the wallet). Same paths and body as the lead's API.
describe('Admin withdrawal API', () => {
  const app = createApp();
  const BASE = '/api/v1/wallets/admin/withdrawals';
  const bankInfo = { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A' };
  let userId: string;
  let adminId: string;

  const admin = () => authHeader(adminId, 'ADMIN');
  const balanceOf = async (filter: Record<string, unknown>) => (await Wallet.findOne(filter).lean())?.balance ?? 0;
  const requestWithdrawal = async (id = userId, amount = 300_000) => {
    const res = await request(app).post('/api/v1/wallets/withdrawals').set(authHeader(id)).send({ amount, bankInfo });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };
  const processRequest = (id: string, body: object) => request(app).patch(`${BASE}/${id}/process`).set(admin()).send(body);

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });
  beforeEach(async () => {
    await resetDatabase();
    userId = (await createUser({ fullName: 'Nguyễn Văn A' }))._id.toString();
    adminId = (await createUser({ role: 'ADMIN', fullName: 'Admin Một' }))._id.toString();
    await fund(userId, 1_000_000);
  });

  it('is for Admins only', async () => {
    const id = await requestWithdrawal();
    expect((await request(app).get(BASE).set(authHeader(userId))).status).toBe(403);
    expect((await request(app).get(`${BASE}/counts`).set(authHeader(userId))).status).toBe(403);
    expect((await request(app).patch(`${BASE}/${id}/process`).set(authHeader(userId)).send({ status: 'completed' })).status).toBe(403);
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it('lists the queue with the owner and full bank details, filters by status and counts', async () => {
    const other = (await createUser({ fullName: 'Trần Thị B' }))._id.toString();
    await fund(other, 500_000);
    const first = await requestWithdrawal(userId, 300_000);
    await requestWithdrawal(other, 200_000);
    await processRequest(first, { status: 'rejected', notes: 'Sai tên chủ tài khoản' }).expect(200);

    const pending = await request(app).get(BASE).query({ status: 'pending' }).set(admin());
    expect(pending.status).toBe(200);
    expect(pending.body.data).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false });
    expect(pending.body.data.items[0]).toMatchObject({
      amount: 200_000,
      status: 'pending',
      user: { id: other, fullName: 'Trần Thị B' },
      // The Admin needs the full account number to transfer the money
      bankInfo: { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A' },
    });

    const all = await request(app).get(BASE).query({ status: 'all' }).set(admin());
    expect(all.body.data.total).toBe(2);

    const counts = await request(app).get(`${BASE}/counts`).set(admin());
    expect(counts.body.data).toEqual({ pending: 1, completed: 0, rejected: 1 });
  });

  it('completes a request: the money leaves escrow, the wallet stays debited, audit row written', async () => {
    const id = await requestWithdrawal();
    expect(await balanceOf({ ownerType: 'escrow' })).toBe(300_000);

    const res = await processRequest(id, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/hoàn tất chuyển tiền/);
    expect(res.body.data).toMatchObject({ id, status: 'completed', processedBy: adminId, user: { id: userId } });
    expect(res.body.data.processedAt).toBeDefined();

    expect(await balanceOf({ ownerType: 'escrow' })).toBe(0);
    expect(await balanceOf({ ownerType: 'external' })).toBe(-1_000_000 + 300_000);
    expect(await balanceOf({ userId })).toBe(700_000);
    const me = await request(app).get('/api/v1/wallets/me').set(authHeader(userId));
    expect(me.body.data).toMatchObject({ availableBalance: 700_000, holdingBalance: 0 });

    const audit = await AuditLog.findOne({ action: 'withdrawal.complete' }).lean();
    expect(audit).toMatchObject({ target_type: 'WITHDRAWAL_REQUEST' });
    expect(String(audit?.target_id)).toBe(id);

    // The user can ask for a new withdrawal once the previous one is done
    await requestWithdrawal(userId, 100_000);
  });

  it('treats "approved" as completed, like the lead’s API', async () => {
    const id = await requestWithdrawal();
    const res = await processRequest(id, { status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('rejects with a reason: the amount goes back to the wallet and shows in the history', async () => {
    const id = await requestWithdrawal();

    const noReason = await processRequest(id, { status: 'rejected' });
    expect(noReason.status).toBe(400);
    expect((await processRequest(id, { status: 'rejected', notes: 'ngắn' })).status).toBe(400);

    const res = await processRequest(id, { status: 'rejected', notes: '  Sai tên chủ tài khoản  ' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/hoàn lại số dư/);
    expect(res.body.data).toMatchObject({ status: 'rejected', notes: 'Sai tên chủ tài khoản' });

    expect(await balanceOf({ userId })).toBe(1_000_000);
    expect(await balanceOf({ ownerType: 'escrow' })).toBe(0);
    const history = await request(app).get('/api/v1/wallets/me/transactions').query({ kind: 'withdrawal' }).set(authHeader(userId));
    const items = history.body.data.transactions ?? history.body.data.items;
    expect(items.map((t: { type: string }) => t.type).sort()).toEqual(['credit', 'debit']);
    expect(items.find((t: { type: string }) => t.type === 'credit').description).toMatch(/Hoàn tiền lệnh rút .* bị từ chối: Sai tên chủ tài khoản/);

    const mine = await request(app).get('/api/v1/wallets/withdrawals').set(authHeader(userId));
    expect(mine.body.data.items[0]).toMatchObject({ status: 'rejected', notes: 'Sai tên chủ tài khoản' });
    expect(mine.body.data.items[0].processedAt).toBeDefined();
    expect(await AuditLog.countDocuments({ action: 'withdrawal.reject' })).toBe(1);
  });

  it('processes a request only once', async () => {
    const id = await requestWithdrawal();
    const [a, b] = await Promise.all([
      processRequest(id, { status: 'completed' }),
      processRequest(id, { status: 'rejected', notes: 'Từ chối cùng lúc' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const again = await processRequest(id, { status: 'completed' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('WITHDRAWAL_ALREADY_PROCESSED');
    // Money moved exactly once: escrow is empty and the user has either 700k (paid) or 1M (refunded)
    expect(await balanceOf({ ownerType: 'escrow' })).toBe(0);
    expect([700_000, 1_000_000]).toContain(await balanceOf({ userId }));
  });

  it('refuses unknown or invalid ids', async () => {
    expect((await processRequest('64b000000000000000000000', { status: 'completed' })).status).toBe(404);
    expect((await processRequest('not-an-id', { status: 'completed' })).status).toBe(400);
    expect((await processRequest('64b000000000000000000000', { status: 'paid' })).status).toBe(400);
  });

  it('freezes a locked account: no payout, but a refund still reaches the wallet', async () => {
    const id = await requestWithdrawal();
    await User.updateOne({ _id: userId }, { $set: { status: 'LOCKED', lock: { reason: 'Vi phạm', lockedAt: new Date() } } });

    const payout = await processRequest(id, { status: 'completed' });
    expect(payout.status).toBe(403);
    expect(payout.body.error.code).toBe('WALLET_FROZEN');
    expect((await WithdrawalRequest.findById(id).lean())?.status).toBe('pending');

    const refund = await processRequest(id, { status: 'rejected', notes: 'Tài khoản đang bị khóa' });
    expect(refund.status).toBe(200);
    expect(await balanceOf({ userId })).toBe(1_000_000);
  });
});
