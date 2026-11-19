import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Wallet, WalletTransaction, WithdrawalRequest as WithdrawalModel } from '../src/models/index.js';
import type { WithdrawalRecord } from '../src/repositories/withdrawal.repository.js';
import { authHeader, createUser, fund } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

/** The model file has no document type */
const WithdrawalRequest = WithdrawalModel as unknown as Model<WithdrawalRecord>;

// UC18 Request withdrawal: pending request + the amount held (user wallet → escrow) in one transaction.
describe('Withdrawal API', () => {
  const app = createApp();
  let userId: string;

  const bankInfo = { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A' };
  const withdraw = (body: object, id = userId) =>
    request(app).post('/api/v1/wallets/withdrawals').set(authHeader(id)).send(body);
  const wallet = async (id = userId) => (await request(app).get('/api/v1/wallets/me').set(authHeader(id))).body.data;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    userId = (await createUser())._id.toString();
  });

  it('creates a pending request and holds the amount in escrow', async () => {
    await fund(userId, 1_000_000);

    const res = await withdraw({ amount: 400_000, bankInfo });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/tạm giữ/);
    expect(res.body.data).toMatchObject({
      userId,
      amount: 400_000,
      status: 'pending',
      bankInfo: { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A' },
    });
    expect(res.body.data.code).toMatch(/^WD\d+$/);

    expect(await wallet()).toMatchObject({
      availableBalance: 600_000,
      holdingBalance: 400_000,
      holdings: { withdrawals: 400_000 },
    });
    const escrow = await Wallet.findOne({ ownerType: 'escrow' }).lean();
    expect(escrow?.balance).toBe(400_000);

    // History: one debit of kind "withdrawal", account number masked in the description
    const history = await request(app)
      .get('/api/v1/wallets/me/transactions?kind=withdrawal')
      .set(authHeader(userId));
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0]).toMatchObject({ amount: 400_000, type: 'debit' });
    expect(history.body.data.items[0].description).toContain('****6789');
    expect(history.body.data.items[0].description).not.toContain('0123456789');
  });

  it('creates nothing when the available balance is too low', async () => {
    await fund(userId, 100_000);

    const res = await withdraw({ amount: 200_000, bankInfo });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await WithdrawalRequest.countDocuments()).toBe(0);
    expect(await wallet()).toMatchObject({ availableBalance: 100_000, holdingBalance: 0 });
  });

  it('allows one pending request at a time, even when two are sent together', async () => {
    await fund(userId, 1_000_000);

    const [a, b] = await Promise.all([
      withdraw({ amount: 100_000, bankInfo }),
      withdraw({ amount: 100_000, bankInfo }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await WithdrawalRequest.countDocuments()).toBe(1);
    expect((await wallet()).availableBalance).toBe(900_000);
    expect(await WalletTransaction.countDocuments({ 'reference.kind': 'withdrawal' })).toBe(2);

    const third = await withdraw({ amount: 100_000, bankInfo });
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('PENDING_WITHDRAWAL_EXISTS');
  });

  it('checks the limits and the bank details', async () => {
    await fund(userId, 50_000_000);

    expect((await withdraw({ amount: 49_000, bankInfo })).status).toBe(400);
    expect((await withdraw({ amount: 20_000_001, bankInfo })).status).toBe(400);
    expect((await withdraw({ amount: 100_000, bankInfo: { ...bankInfo, accountNumber: '12ab34' } })).status).toBe(400);
    expect((await withdraw({ amount: 100_000, bankInfo: { ...bankInfo, accountHolderName: 'A' } })).status).toBe(400);
    expect((await withdraw({ amount: 100_000 })).status).toBe(400);
    expect(await WithdrawalRequest.countDocuments()).toBe(0);
  });

  it('lists the user’s own requests, newest first, in the lead’s list shape', async () => {
    await fund(userId, 1_000_000);
    await withdraw({ amount: 100_000, bankInfo });
    await WithdrawalRequest.updateMany({}, { $set: { status: 'completed' } });
    await withdraw({ amount: 200_000, bankInfo });

    const other = (await createUser())._id.toString();
    await fund(other, 500_000);
    await withdraw({ amount: 300_000, bankInfo }, other);

    const res = await request(app).get('/api/v1/wallets/withdrawals?page=1&limit=5').set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, page: 1, limit: 5, totalPages: 1, hasNextPage: false });
    expect(res.body.data.items.map((w: { amount: number; status: string }) => [w.amount, w.status])).toEqual([
      [200_000, 'pending'],
      [100_000, 'completed'],
    ]);
    // Only the pending one is still held
    expect((await wallet()).holdingBalance).toBe(200_000);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).post('/api/v1/wallets/withdrawals').send({ amount: 100_000, bankInfo })).status).toBe(
      401,
    );
    expect((await request(app).get('/api/v1/wallets/withdrawals')).status).toBe(401);
  });
});
