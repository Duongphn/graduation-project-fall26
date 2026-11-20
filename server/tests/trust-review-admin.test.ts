import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog, Dispute, OrderStatusHistory, RentalOrder, User } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';
import { createCompletedRental, seedReceivedReviews } from './helpers/review-fixtures.js';

const NOW = '2026-11-19T03:00:00Z';
const DAY_MS = 86_400_000;
const REASON = 'Đã liên hệ, người dùng hợp tác tốt';

describe('Admin trust review queue', () => {
  let app: any;
  let clock: FakeClock;
  let sent: any[];
  let notifier: any;
  let ownerId: string;
  let adminAuth: any;
  let renterId: string;
  let renterAuth: any;

  const period = { startDate: '2026-11-23', endDate: '2026-11-25' };
  const decide = (userId: string, body: unknown) =>
    request(app)
      .post(`/api/v1/admin/trust-reviews/${userId}/decision`)
      .set(adminAuth)
      .send(body as object);

  // Gets the renter blocked and queued through the real gate.
  const queueRenter = async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    const toy = await createRentToy(ownerId, { depositPrice: 600_000, title: 'Lego Castle' });
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), ...period });
    expect(res.status).toBe(403);
    return toy._id.toString();
  };

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock(NOW);
    const built = buildRentalApp(clock);
    app = built.app;
    sent = built.notifier.sent;
    notifier = built.notifier.notifier;
    ownerId = (await createUser())._id.toString();
    const adminId = (await createUser({ role: 'ADMIN' }))._id.toString();
    adminAuth = authHeader(adminId, 'ADMIN');
    const renter = await createUser({ fullName: 'Low Renter', phone: '+84912345678' });
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);
  });

  it('lists the queue oldest first with masked phone', async () => {
    const second = await createUser({ fullName: 'Second', phone: '+84987654321' });
    await createUser({ fullName: 'Not queued' });
    const toyId = await queueRenter();
    await User.updateOne(
      { _id: renterId },
      { $set: { 'trust.review.requestedAt': new Date(clock.now().getTime() - 2 * 3_600_000) } },
    );
    await User.updateOne(
      { _id: second._id },
      {
        $set: {
          'trust.score': 10,
          'trust.review.requestedAt': new Date(clock.now().getTime() - 3_600_000),
        },
      },
    );

    const res = await request(app).get('/api/v1/admin/trust-reviews').set(adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, page: 1, limit: 20 });
    expect(res.body.data.items[0].userId).toBe(renterId);
    expect(res.body.data.items[1].userId).toBe(second._id.toString());
    expect(res.body.data.items[0].phone).not.toContain('+84912345678');
    expect(res.body.data.items[0].phone).toContain('***');
    expect(res.body.data.items[0].lastBlocked).toMatchObject({
      toyId,
      toyTitle: 'Lego Castle',
      depositAmount: 600000,
    });
    expect(res.body.data.items[1].lastBlocked).toBeNull();
  });

  it('rejects non-admins', async () => {
    expect((await request(app).get('/api/v1/admin/trust-reviews').set(renterAuth)).status).toBe(
      403,
    );
    expect(
      (await request(app).get(`/api/v1/admin/trust-reviews/${renterId}`).set(renterAuth)).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/trust-reviews/${renterId}/decision`)
          .set(renterAuth)
          .send({ decision: 'ALLOW', reason: REASON })
      ).status,
    ).toBe(403);
  });

  it('detail lists the evidence', async () => {
    await queueRenter();
    const order = await createCompletedRental({
      renterId,
      ownerId,
      toyId: new mongoose.Types.ObjectId(),
      settledAt: clock.now(),
    });
    await RentalOrder.updateOne({ _id: order._id }, { status: 'EXPIRED' });
    await OrderStatusHistory.create({
      orderType: 'RENTAL',
      orderId: order._id,
      oldStatus: 'PENDING_PAYMENT',
      newStatus: 'EXPIRED',
      changedBy: new mongoose.Types.ObjectId(),
      notes: 'system:PAYMENT',
      occurredAt: clock.now(),
    });
    await Dispute.create({
      code: 'DP-T7-1',
      orderType: 'rental_order',
      orderId: order._id,
      claimantId: ownerId,
      respondentId: renterId,
      claimantRole: 'owner',
      reason: 'DAMAGED',
      description: 'broken',
      status: 'resolved',
      resolution: {
        verdict: 'CLAIMANT_FAVORED',
        compensation: 1,
        reason: 'r',
        resolvedAt: clock.now(),
        payout: { renter: 0, owner: 1, platform: 0 },
      },
    });

    const res = await request(app).get(`/api/v1/admin/trust-reviews/${renterId}`).set(adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.reviews).toHaveLength(3);
    expect(res.body.data.expiredOrders).toHaveLength(1);
    expect(res.body.data.expiredOrders[0]).toMatchObject({ code: order.code });
    expect(res.body.data.disputesLost).toHaveLength(1);
    expect(res.body.data.disputesLost[0]).toMatchObject({
      code: 'DP-T7-1',
      verdict: 'CLAIMANT_FAVORED',
    });
  });

  it('detail 404 for unknown user', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/trust-reviews/${new mongoose.Types.ObjectId()}`)
      .set(adminAuth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('ALLOW grants 30 days and leaves the queue', async () => {
    const toyId = await queueRenter();
    const res = await decide(renterId, { decision: 'ALLOW', reason: REASON });
    expect(res.status).toBe(200);

    const trust = (await User.findById(renterId).lean())!.trust!;
    expect(trust.override?.allowedUntil).toEqual(new Date(clock.now().getTime() + 30 * DAY_MS));
    expect(trust.review?.requestedAt).toBeUndefined();
    expect('requestedAt' in (trust.review ?? {})).toBe(false);
    expect(trust.lastDecision?.scoreAtDecision).toBe(20);
    expect(trust.lastDecision?.decision).toBe('ALLOW');
    expect(await AuditLog.countDocuments({ action: 'trust.allow', target_type: 'USER' })).toBe(1);
    expect(
      sent.some((n) => n.userId === renterId && n.title === 'Bạn đã được cho phép đặt thuê'),
    ).toBe(true);

    const create = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, ...period });
    expect(create.status).toBe(201);
  });

  it('KEEP_RESTRICTED records the decision', async () => {
    await queueRenter();
    const res = await decide(renterId, { decision: 'KEEP_RESTRICTED', reason: REASON });
    expect(res.status).toBe(200);
    const trust = (await User.findById(renterId).lean())!.trust!;
    expect(trust.override?.allowedUntil).toBeUndefined();
    expect(trust.lastDecision?.decision).toBe('KEEP_RESTRICTED');
    expect(trust.review?.requestedAt).toBeUndefined();
    expect(
      await AuditLog.countDocuments({ action: 'trust.keep_restricted', target_type: 'USER' }),
    ).toBe(1);
    expect(
      sent.some((n) => n.userId === renterId && n.title === 'Hạn chế đặt thuê được giữ nguyên'),
    ).toBe(true);
  });

  it('validates reason and decision', async () => {
    await queueRenter();
    for (const body of [
      { decision: 'ALLOW', reason: 'ngắn' },
      { decision: 'X', reason: REASON },
    ]) {
      const res = await decide(renterId, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects users not in the queue', async () => {
    const res = await decide(renterId, { decision: 'ALLOW', reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRUST_REVIEW_NOT_PENDING');
  });

  it('two admins at once: one 200, one 409, one audit row', async () => {
    await queueRenter();
    const results = await Promise.all([
      decide(renterId, { decision: 'ALLOW', reason: REASON }),
      decide(renterId, { decision: 'KEEP_RESTRICTED', reason: REASON }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await AuditLog.countDocuments({ target_type: 'USER' })).toBe(1);
  });

  it('ALLOW notification date is in Vietnam time', async () => {
    clock.set('2026-11-19T18:00:00Z');
    await queueRenter();
    expect((await decide(renterId, { decision: 'ALLOW', reason: REASON })).status).toBe(200);
    const notice = sent.find((n) => n.title === 'Bạn đã được cho phép đặt thuê');
    expect(notice.body).toContain('đến 20/12/2026.');
  });

  it('a failing notifier does not fail a committed decision', async () => {
    await queueRenter();
    notifier.notify = async () => {
      throw new Error('boom');
    };
    const res = await decide(renterId, { decision: 'ALLOW', reason: REASON });
    expect(res.status).toBe(200);
    const trust = (await User.findById(renterId).lean())!.trust!;
    expect(trust.lastDecision?.decision).toBe('ALLOW');
    expect(trust.review?.requestedAt).toBeUndefined();
  });

  it('expiredOrders only include the own orders of the user', async () => {
    await queueRenter();
    const other = await createUser();
    const mine = await createCompletedRental({
      renterId,
      ownerId,
      toyId: new mongoose.Types.ObjectId(),
      settledAt: clock.now(),
    });
    const theirs = await createCompletedRental({
      renterId: other._id,
      ownerId,
      toyId: new mongoose.Types.ObjectId(),
      settledAt: clock.now(),
    });
    for (const o of [mine, theirs]) {
      await RentalOrder.updateOne({ _id: o._id }, { status: 'EXPIRED' });
      await OrderStatusHistory.create({
        orderType: 'RENTAL',
        orderId: o._id,
        newStatus: 'EXPIRED',
        changedBy: new mongoose.Types.ObjectId(),
        notes: 'system:PAYMENT',
        occurredAt: clock.now(),
      });
    }
    const res = await request(app).get(`/api/v1/admin/trust-reviews/${renterId}`).set(adminAuth);
    expect(res.body.data.expiredOrders.map((o: any) => o.code)).toEqual([mine.code]);
  });
});
