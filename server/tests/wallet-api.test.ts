import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AuditLog } from '../src/models/audit-log.model.js';
import { User, WalletTransaction } from '../src/models/index.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('Wallet API', () => {
  const app = createApp();

  const auth = (userId: string, role: 'USER' | 'ADMIN' = 'USER') => ({
    Authorization: `Bearer ${jwt.sign({ userId, role }, env.jwtAccessSecret)}`,
  });

  const body = (res: request.Response) => res.body.data;

  let userId: string;
  let adminId: string;

  const actorFor = (role: string) => (role === 'ADMIN' ? adminId : userId);

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();

    const user = await User.create({
      phone: '0901234567',
      email: 'user@example.com',
      passwordHash: 'hash',
      fullName: 'Regular User',
      role: 'USER',
      status: 'ACTIVE',
      verificationStatus: 'verified',
    });
    userId = user._id.toString();

    const admin = await User.create({
      phone: '0909999999',
      email: 'admin@example.com',
      passwordHash: 'hash',
      fullName: 'Admin User',
      role: 'ADMIN',
      status: 'ACTIVE',
      verificationStatus: 'verified',
    });
    adminId = admin._id.toString();
  });

  it('credits a user and shows it in their wallet', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/wallets/${userId}/credit`)
      .set(auth(adminId, 'ADMIN'))
      .send({ amount: 500_000, note: 'Nạp thử' });

    expect(res.status).toBe(201);
    expect(body(res)).toMatchObject({ amount: 500_000, balance: 500_000 });

    const me = await request(app).get('/api/v1/wallets/me').set(auth(userId, 'USER'));
    expect(me.status).toBe(200);
    expect(body(me)).toMatchObject({ balance: 500_000, currency: 'VND', total: 1 });
    expect(body(me).transactions[0]).toMatchObject({
      amount: 500_000,
      type: 'credit',
      description: 'Nạp thử',
    });
  });

  // DEF-ST-28 (R03 IV.2.3 audit trail): a credit records who credited, the user, the amount and the note.
  it('writes one audit entry for an Admin credit', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/wallets/${userId}/credit`)
      .set(auth(adminId, 'ADMIN'))
      .send({ amount: 250_000, note: '  Hoàn tiền sự cố  ' });
    expect(res.status).toBe(201);

    const logs = await AuditLog.find().lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'wallet.credit',
      target_type: 'USER',
      details: { amount: 250_000, note: 'Hoàn tiền sự cố' },
    });
    expect(String(logs[0]!.actor_id)).toBe(adminId);
    expect(String(logs[0]!.target_id)).toBe(userId);
    expect(logs[0]!.ip_address).toBeTruthy();

    // Without a note only the amount is kept.
    await request(app)
      .post(`/api/v1/admin/wallets/${userId}/credit`)
      .set(auth(adminId, 'ADMIN'))
      .send({ amount: 1_000 })
      .expect(201);
    const second = await AuditLog.findOne({ 'details.amount': 1_000 }).lean();
    expect(second?.details).toEqual({ amount: 1_000 });
  });

  it('returns an empty wallet for a new user', async () => {
    const newUser = await User.create({
      phone: '0908888888',
      email: 'new@example.com',
      passwordHash: 'hash',
      fullName: 'New User',
      role: 'USER',
      status: 'ACTIVE',
      verificationStatus: 'verified',
    });
    const newUserId = newUser._id.toString();

    const res = await request(app).get('/api/v1/wallets/me').set(auth(newUserId, 'USER'));
    expect(res.status).toBe(200);
    expect(body(res)).toMatchObject({ balance: 0, transactions: [] });
  });

  // Review Focus #5
  it.each([
    ['unknown user', () => new mongoose.Types.ObjectId().toString(), { amount: 1000 }, 'ADMIN', 404],
    ['fractional amount', () => userId, { amount: 10.5 }, 'ADMIN', 400],
    ['zero amount', () => userId, { amount: 0 }, 'ADMIN', 400],
    ['too large', () => userId, { amount: 100_000_001 }, 'ADMIN', 400],
    ['user token', () => userId, { amount: 1000 }, 'USER', 403],
  ])('rejects credit: %s', async (_n, target, payload, role, status) => {
    const res = await request(app)
      .post(`/api/v1/admin/wallets/${target()}/credit`)
      .set(auth(actorFor(role), role as 'USER' | 'ADMIN'))
      .send(payload);

    expect(res.status).toBe(status);
    expect(await WalletTransaction.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});
