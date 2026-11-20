import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Dispute, OrderStatusHistory, RentalOrder, User } from '../src/models/index.js';
import { computeTrustScore } from '../src/services/trust-score.js';
import { TrustScoreService } from '../src/services/trust-score.service.js';
import { SystemSettingService } from '../src/services/system-setting.service.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fakeNotifier,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';
import { createCompletedRental, seedReceivedReviews } from './helpers/review-fixtures.js';

const NOW = '2026-11-19T03:00:00Z';
const daysAgo = (n: number) => new Date(new Date(NOW).getTime() - n * 86_400_000);
const base = { cancellations: 0, disputesLost: 0, minReviews: 3 };

describe('computeTrustScore', () => {
  it('returns null below the review threshold', () => {
    expect(computeTrustScore({ ...base, reviewCount: 2, ratingAverage: 5 })).toBeNull();
  });
  it('maps average rating to 0-100', () => {
    expect(computeTrustScore({ ...base, reviewCount: 3, ratingAverage: 4.6667 })).toBe(93);
    expect(computeTrustScore({ ...base, reviewCount: 3, ratingAverage: 5 })).toBe(100);
  });
  it('applies penalties and clamps at 0', () => {
    expect(
      computeTrustScore({ ...base, reviewCount: 3, ratingAverage: 4, cancellations: 1, disputesLost: 1 }),
    ).toBe(65);
    expect(computeTrustScore({ ...base, reviewCount: 3, ratingAverage: 1, cancellations: 3 })).toBe(5);
    expect(
      computeTrustScore({ ...base, reviewCount: 3, ratingAverage: 1, cancellations: 3, disputesLost: 1 }),
    ).toBe(0);
  });
});

describe('TrustScoreService', () => {
  let service: TrustScoreService;

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });
  beforeEach(async () => {
    await resetDatabase();
    service = new TrustScoreService({
      clock: new FakeClock(NOW),
      settings: new SystemSettingService(),
      notifier: fakeNotifier().notifier,
    });
  });

  async function expiredOrder(renterId: unknown, ownerId: unknown, note: string, occurredAt = daysAgo(5)) {
    const toy = await createRentToy(String(ownerId));
    const order = await createCompletedRental({
      renterId: String(renterId),
      ownerId: String(ownerId),
      toyId: String(toy._id),
      settledAt: daysAgo(5),
    });
    await RentalOrder.updateOne({ _id: order._id }, { status: 'EXPIRED' });
    await OrderStatusHistory.create({
      orderType: 'RENTAL',
      orderId: order._id,
      oldStatus: 'ACCEPTED',
      newStatus: 'EXPIRED',
      changedBy: new mongoose.Types.ObjectId(),
      notes: note,
      occurredAt,
    });
  }

  async function dispute(
    claimantId: unknown,
    respondentId: unknown,
    verdict: string,
    resolvedAt: Date,
  ) {
    await Dispute.create({
      code: `D-${new mongoose.Types.ObjectId().toString()}`,
      orderType: 'rental_order',
      orderId: new mongoose.Types.ObjectId(),
      claimantId,
      respondentId,
      claimantRole: 'owner',
      reason: 'damaged',
      description: 'desc',
      status: 'resolved',
      openedAt: daysAgo(200),
      resolution: {
        verdict,
        compensation: 0,
        reason: 'r',
        resolvedAt,
        payout: { renter: 0, owner: 0, platform: 0 },
      },
    });
  }

  it('scores from reviews received in the last 180 days', async () => {
    const user = await createUser();
    await seedReceivedReviews(String(user._id), [5, 5, 4], daysAgo(10));
    await seedReceivedReviews(String(user._id), [1], daysAgo(181));
    const snap = await service.recompute(String(user._id));
    expect(snap).toMatchObject({ score: 93, reviewCount: 3 });
    expect((await User.findById(user._id))!.trust?.score).toBe(93);
  });

  it('counts both owner and renter roles', async () => {
    const user = await createUser();
    await seedReceivedReviews(String(user._id), [5, 5], daysAgo(1), 'RENTER_TO_OWNER');
    await seedReceivedReviews(String(user._id), [5], daysAgo(1), 'OWNER_TO_RENTER');
    expect((await service.recompute(String(user._id))).reviewCount).toBe(3);
  });

  it('penalises payment expiry of the renter only', async () => {
    const user = await createUser();
    const other = await createUser();
    await expiredOrder(user._id, other._id, 'system:PAYMENT');
    await expiredOrder(user._id, other._id, 'system:OWNER_RESPONSE');
    await expiredOrder(other._id, user._id, 'system:PAYMENT');
    expect((await service.recompute(String(user._id))).cancellations).toBe(1);
  });

  it('ignores payment expiry older than 180 days', async () => {
    const user = await createUser();
    const other = await createUser();
    await expiredOrder(user._id, other._id, 'system:PAYMENT', daysAgo(181));
    await expiredOrder(user._id, other._id, 'system:PAYMENT', daysAgo(5));
    expect((await service.recompute(String(user._id))).cancellations).toBe(1);
  });

  it('penalises the respondent of CLAIMANT_FAVORED and PARTIAL only', async () => {
    const user = await createUser();
    const other = await createUser();
    await dispute(other._id, user._id, 'CLAIMANT_FAVORED', daysAgo(5));
    await dispute(other._id, user._id, 'PARTIAL', daysAgo(5));
    await dispute(user._id, other._id, 'RESPONDENT_FAVORED', daysAgo(5));
    await dispute(other._id, user._id, 'CLAIMANT_FAVORED', daysAgo(181));
    expect((await service.recompute(String(user._id))).disputesLost).toBe(2);
  });

  it('keeps review/override/lastDecision untouched', async () => {
    const requestedAt = daysAgo(3);
    const user = await createUser({
      trust: { score: 80, review: { requestedAt }, lastDecision: { decision: 'ALLOW' } },
    });
    await service.recompute(String(user._id));
    const fresh = (await User.findById(user._id).lean())!;
    expect(fresh.trust?.review?.requestedAt).toEqual(requestedAt);
    expect(fresh.trust?.lastDecision).toBeDefined();
  });

  it('recomputeQuietly swallows errors', async () => {
    await expect(service.recomputeQuietly(['not-an-id'])).resolves.toBeUndefined();
  });
});

describe('recompute hooks', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  let app: any;
  let clock: FakeClock;
  let ownerId: string;
  let renterId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let orderId: string;
  const unwrap = (res: request.Response) => res.body.data;
  const container = () => (app as any).locals.container;

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });
  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock('2026-11-01T03:00:00Z');
    app = buildRentalApp(clock).app;
    ownerId = (await createUser())._id.toString();
    renterId = (await createUser())._id.toString();
    ownerAuth = authHeader(ownerId);
    renterAuth = authHeader(renterId);
    const toy = await createRentToy(ownerId);
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-06' });
    orderId = unwrap(created).id;
  });

  it('payment expiry recomputes the renter', async () => {
    await seedReceivedReviews(renterId, [4, 4, 4], daysAgo(40), 'OWNER_TO_RENTER');
    await container().trustScoreService.recompute(renterId);
    expect((await User.findById(renterId))!.trust?.score).toBe(80);

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    clock.advanceHours(13);
    await container().rentalSystemService.expire(orderId, 'PAYMENT');

    const renter = (await User.findById(renterId))!;
    expect(renter.trust?.score).toBe(75);
    expect(renter.trust?.cancellations).toBe(1);
  });

  it('owner response expiry does not change the renter', async () => {
    clock.advanceHours(25);
    await container().rentalSystemService.expire(orderId, 'OWNER_RESPONSE');
    expect((await RentalOrder.findById(orderId))!.status).toBe('EXPIRED');
    const renter = (await User.findById(renterId))!;
    expect(renter.trust?.cancellations ?? 0).toBe(0);
  });

  it('dispute verdict recomputes both parties', async () => {
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    clock.set('2026-11-04T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    clock.set('2026-11-05T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
    clock.set('2026-11-06T10:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
    clock.advanceHours(1);
    const opened = await request(app)
      .post(`/api/v1/rentals/${orderId}/disputes`)
      .set(ownerAuth)
      .field('reason', 'DAMAGED_ON_RETURN')
      .field('description', 'Đồ chơi bị nứt phần thân, thiếu một bánh xe.')
      .attach('photos', JPEG, 'evidence.jpg');
    expect(opened.status).toBe(201);
    const id = unwrap(opened).dispute.id;
    const responded = await request(app)
      .post(`/api/v1/disputes/${id}/response`)
      .set(renterAuth)
      .field('message', 'Đồ chơi còn nguyên vẹn khi trả, có ảnh đối chiếu.');
    expect(responded.status).toBe(200);

    const adminId = (await createUser({ role: 'ADMIN' }))._id.toString();
    const res = await request(app)
      .post(`/api/v1/admin/disputes/${id}/resolve`)
      .set(authHeader(adminId, 'ADMIN'))
      .send({
        verdict: 'CLAIMANT_FAVORED',
        compensation: 50_000,
        reason: 'Ảnh lúc giao và lúc trả cho thấy vết nứt mới xuất hiện sau khi thuê.',
      });
    expect(res.status).toBe(200);

    expect((await User.findById(renterId))!.trust?.disputesLost).toBe(1);
    expect((await User.findById(ownerId))!.trust?.computedAt).toBeDefined();
  });
});
