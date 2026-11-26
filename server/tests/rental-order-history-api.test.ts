import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM_ACTOR_ID } from '../src/constants/rental-order-status.js';
import { OrderStatusHistory, RentalOrder } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('UC16: Order History and Detail API End-to-End Tests', () => {
  let app: any;
  let clock: FakeClock;

  let ownerId: string;
  let ownerAuth: { Authorization: string };

  let renterId: string;
  let renterAuth: { Authorization: string };

  let adminId: string;
  let adminAuth: { Authorization: string };

  let strangerId: string;
  let strangerAuth: { Authorization: string };

  let toyId: string;
  let baseOrderId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  async function createOrderDoc(overrides: Record<string, unknown> = {}) {
    const code = 'RO-' + new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase();
    const order = await RentalOrder.create({
      code,
      renterId: new mongoose.Types.ObjectId((overrides.renterId as string) ?? renterId),
      ownerId: new mongoose.Types.ObjectId((overrides.ownerId as string) ?? ownerId),
      toyId: new mongoose.Types.ObjectId((overrides.toyId as string) ?? toyId),
      period: (overrides.period as any) ?? {
        startDate: new Date('2026-11-05T00:00:00Z'),
        endDate: new Date('2026-11-07T00:00:00Z'),
      },
      pricing: (overrides.pricing as any) ?? {
        days: 3,
        dailyRate: 50_000,
        rentalFee: 150_000,
        depositAmount: 200_000,
        platformFeeRate: 0.1,
        platformFee: 15_000,
        totalPayable: 350_000,
      },
      status: (overrides.status as any) ?? 'PENDING',
      timer: overrides.timer,
      handover: overrides.handover,
      rentalStartedAt: overrides.rentalStartedAt,
      returnInfo: overrides.returnInfo,
      settlement: overrides.settlement,
      createdAt: (overrides.createdAt as Date) ?? new Date('2026-11-01T03:00:00Z'),
      updatedAt: (overrides.updatedAt as Date) ?? new Date('2026-11-01T03:00:00Z'),
    });

    await OrderStatusHistory.create({
      orderType: 'RENTAL',
      orderId: order._id,
      newStatus: order.status,
      changedBy: new mongoose.Types.ObjectId((overrides.renterId as string) ?? renterId),
      occurredAt: order.createdAt,
      notes: 'Tạo đơn thuê ban đầu',
    });

    return order;
  }

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock('2026-11-01T03:00:00Z');
    const built = buildRentalApp(clock);
    app = built.app;

    const owner = await createUser({
      fullName: 'Alice Owner',
      trust: { score: 92 },
      avatar: 'https://images.example.com/alice.png',
      verificationStatus: 'verified',
    });
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser({
      fullName: 'Bob Renter',
      trust: { score: 88 },
      avatar: 'https://images.example.com/bob.png',
      verificationStatus: 'verified',
    });
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const admin = await createUser({
      fullName: 'Charlie Admin',
      role: 'ADMIN',
      verificationStatus: 'verified',
    });
    adminId = admin._id.toString();
    adminAuth = authHeader(adminId, 'ADMIN');

    const stranger = await createUser({
      fullName: 'Eve Stranger',
      trust: { score: 75 },
    });
    strangerId = stranger._id.toString();
    strangerAuth = authHeader(strangerId);

    const toy = await createRentToy(ownerId, {
      title: 'Lego Star Wars Millennium Falcon',
      priceOrRate: 50_000,
      depositPrice: 200_000,
      images: [{ url: 'https://images.example.com/lego-falcon.jpg', publicId: 'img-falcon-1' }],
    });
    toyId = toy._id.toString();

    // Standard pending rental order created via API
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    baseOrderId = unwrap(res).id;
  });

  // =========================================================================
  // Scenario 1: Order List as Renter
  // =========================================================================
  describe('1. Order List as Renter', () => {
    it('returns orders where caller is renter with enriched toy, counterpart, and NO platform fee leakage', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=renter')
        .set(renterAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(1);
      expect(data.items).toHaveLength(1);

      const item = data.items[0];
      expect(item.id).toBe(baseOrderId);
      expect(item.role).toBe('renter');
      expect(item.status).toBe('PENDING');

      // Enriched toy summary
      expect(item.toy).toBeDefined();
      expect(item.toy).toMatchObject({
        id: toyId,
        name: 'Lego Star Wars Millennium Falcon',
        primaryImage: 'https://images.example.com/lego-falcon.jpg',
        dailyRate: 50_000,
        depositAmount: 200_000,
      });
      expect(typeof item.toy.slug).toBe('string');
      expect(item.toy.slug.length).toBeGreaterThan(0);

      // Enriched counterpart (Owner)
      expect(item.counterpart).toBeDefined();
      expect(item.counterpart).toMatchObject({
        id: ownerId,
        fullName: 'Alice Owner',
        avatar: 'https://images.example.com/alice.png',
        trustScore: 92,
        verified: true,
        role: 'owner',
      });

      // Crucial: Renter payload does NOT leak platformFeeRate or platformFee
      expect(item.pricing).toBeDefined();
      expect(item.pricing.days).toBe(3);
      expect(item.pricing.dailyRate).toBe(50_000);
      expect(item.pricing.rentalFee).toBe(150_000);
      expect(item.pricing.depositAmount).toBe(200_000);
      expect(item.pricing.totalPayable).toBe(350_000);

      expect(item.pricing.platformFeeRate).toBeUndefined();
      expect(item.pricing.platformFee).toBeUndefined();
      expect('platformFeeRate' in item.pricing).toBe(false);
      expect('platformFee' in item.pricing).toBe(false);
    });

    it('defaults to role=renter when role query parameter is omitted', async () => {
      const res = await request(app)
        .get('/api/v1/rentals')
        .set(renterAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(1);
      expect(data.items[0].role).toBe('renter');
    });
  });

  // =========================================================================
  // Scenario 2: Order List as Owner
  // =========================================================================
  describe('2. Order List as Owner', () => {
    it('returns orders where caller is owner with counterpart renter and DOES include platform fee', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=owner')
        .set(ownerAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(1);
      expect(data.items).toHaveLength(1);

      const item = data.items[0];
      expect(item.id).toBe(baseOrderId);
      expect(item.role).toBe('owner');
      expect(item.status).toBe('PENDING');

      // Enriched toy summary
      expect(item.toy).toMatchObject({
        id: toyId,
        name: 'Lego Star Wars Millennium Falcon',
        primaryImage: 'https://images.example.com/lego-falcon.jpg',
        dailyRate: 50_000,
        depositAmount: 200_000,
      });

      // Enriched counterpart (Renter)
      expect(item.counterpart).toMatchObject({
        id: renterId,
        fullName: 'Bob Renter',
        avatar: 'https://images.example.com/bob.png',
        trustScore: 88,
        verified: true,
        role: 'renter',
      });

      // Owner item pricing DOES include platformFeeRate and platformFee
      expect(item.pricing).toBeDefined();
      expect(item.pricing.platformFeeRate).toBe(0.1);
      expect(item.pricing.platformFee).toBe(15_000);
      expect(item.pricing.rentalFee).toBe(150_000);
      expect(item.pricing.depositAmount).toBe(200_000);
      expect(item.pricing.totalPayable).toBe(350_000);
    });
  });

  // =========================================================================
  // Scenario 3: Status & Status Group Filtering
  // =========================================================================
  describe('3. Status & Status Group Filtering', () => {
    beforeEach(async () => {
      // Clear database to set up predictable multi-status orders
      await resetDatabase();
      const owner = await createUser({ fullName: 'Alice Owner' });
      ownerId = owner._id.toString();
      ownerAuth = authHeader(ownerId);

      const renter = await createUser({ fullName: 'Bob Renter' });
      renterId = renter._id.toString();
      renterAuth = authHeader(renterId);

      const toy = await createRentToy(ownerId);
      toyId = toy._id.toString();

      // Seed 5 orders with different statuses for this owner & renter
      await createOrderDoc({ status: 'PENDING' });
      await createOrderDoc({ status: 'ACCEPTED' });
      await createOrderDoc({ status: 'IN_USE' });
      await createOrderDoc({ status: 'COMPLETED' });
      await createOrderDoc({ status: 'CANCELLED' });
    });

    it('filters by single status ?status=IN_USE and ?status=ACCEPTED', async () => {
      const resInUse = await request(app)
        .get('/api/v1/rentals?role=owner&status=IN_USE')
        .set(ownerAuth);
      expect(resInUse.status).toBe(200);
      const dataInUse = unwrap(resInUse);
      expect(dataInUse.total).toBe(1);
      expect(dataInUse.items[0].status).toBe('IN_USE');

      const resAccepted = await request(app)
        .get('/api/v1/rentals?role=owner&status=ACCEPTED')
        .set(ownerAuth);
      expect(resAccepted.status).toBe(200);
      const dataAccepted = unwrap(resAccepted);
      expect(dataAccepted.total).toBe(1);
      expect(dataAccepted.items[0].status).toBe('ACCEPTED');
    });

    it('filters by comma-separated status ?status=PENDING,ACCEPTED', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=owner&status=PENDING,ACCEPTED')
        .set(ownerAuth);
      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(2);
      const statuses = data.items.map((i: any) => i.status).sort();
      expect(statuses).toEqual(['ACCEPTED', 'PENDING']);
    });

    it('filters by status group ?group=active (matches ACCEPTED, PAID, SHIPPING, IN_USE, RETURNING)', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=owner&group=active')
        .set(ownerAuth);
      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(2);
      const statuses = data.items.map((i: any) => i.status).sort();
      expect(statuses).toEqual(['ACCEPTED', 'IN_USE']);
    });

    it('filters by status group ?group=completed (matches COMPLETED)', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=owner&group=completed')
        .set(ownerAuth);
      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(1);
      expect(data.items[0].status).toBe('COMPLETED');
    });

    it('returns 400 when group and status are contradictory (?group=active&status=COMPLETED)', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=owner&group=active&status=COMPLETED')
        .set(ownerAuth);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    });

    it.each([
      'role=admin',
      'status=FOO',
      'status=PENDING,FOO',
      'group=unknown',
      'group=constructor',
      'group=toString',
      'group=__proto__',
    ])('returns 400 VALIDATION_ERROR for invalid query %s', async (qs) => {
      const res = await request(app).get(`/api/v1/rentals?${qs}`).set(ownerAuth);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    });

    it('filters by group=cancelled and group=pending', async () => {
      const cancelled = unwrap(
        await request(app).get('/api/v1/rentals?role=owner&group=cancelled').set(ownerAuth),
      );
      expect(cancelled.items.map((i: any) => i.status)).toEqual(['CANCELLED']);

      const pending = unwrap(
        await request(app).get('/api/v1/rentals?role=owner&group=pending').set(ownerAuth),
      );
      expect(pending.items.map((i: any) => i.status)).toEqual(['PENDING']);
    });

    it('paginates with page/limit and keeps total across pages', async () => {
      const page1 = unwrap(
        await request(app).get('/api/v1/rentals?role=owner&limit=2&page=1').set(ownerAuth),
      );
      const page3 = unwrap(
        await request(app).get('/api/v1/rentals?role=owner&limit=2&page=3').set(ownerAuth),
      );

      expect(page1).toMatchObject({ total: 5, page: 1, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page3.items).toHaveLength(1);

      const page2 = unwrap(
        await request(app).get('/api/v1/rentals?role=owner&limit=2&page=2').set(ownerAuth),
      );
      const ids = [...page1.items, ...page2.items, ...page3.items].map((i: any) => i.id);
      expect(new Set(ids).size).toBe(5);
    });
  });

  // =========================================================================
  // Scenario 4: Admin Access & role=all
  // =========================================================================
  describe('4. Admin Access & role=all', () => {
    let secondOrderId: string;

    beforeEach(async () => {
      // Create a second pair of users and an order
      const secondOwner = await createUser({ fullName: 'Second Owner' });
      const secondRenter = await createUser({ fullName: 'Second Renter' });
      const secondToy = await createRentToy(secondOwner._id.toString());
      const secondOrder = await createOrderDoc({
        ownerId: secondOwner._id.toString(),
        renterId: secondRenter._id.toString(),
        toyId: secondToy._id.toString(),
        status: 'ACCEPTED',
      });
      secondOrderId = secondOrder._id.toString();
    });

    it('admin calling GET /api/v1/rentals?role=all sees orders across all parties', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=all')
        .set(adminAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(2);
      const orderIds = data.items.map((i: any) => i.id);
      expect(orderIds).toContain(baseOrderId);
      expect(orderIds).toContain(secondOrderId);
    });

    it('marks orders the admin is not party to as role=admin with both parties and no counterpart', async () => {
      const data = unwrap(await request(app).get('/api/v1/rentals?role=all').set(adminAuth));
      const item = data.items.find((i: any) => i.id === baseOrderId);

      expect(item.role).toBe('admin');
      expect(item.counterpart).toBeUndefined();
      expect(item.renter).toMatchObject({ id: renterId, fullName: 'Bob Renter', role: 'renter' });
      expect(item.owner).toMatchObject({ id: ownerId, fullName: 'Alice Owner', role: 'owner' });
      expect(item.pricing.platformFee).toBe(15_000);
    });

    it('admin can read /history of an order they are not party to', async () => {
      const res = await request(app).get(`/api/v1/rentals/${baseOrderId}/history`).set(adminAuth);
      expect(res.status).toBe(200);
      expect(unwrap(res)).toHaveLength(1);
    });

    it('non-admin calling GET /api/v1/rentals?role=all receives 403 FORBIDDEN_RENTAL_ACTION', async () => {
      const renterRes = await request(app)
        .get('/api/v1/rentals?role=all')
        .set(renterAuth);
      expect(renterRes.status).toBe(403);
      expect(errorOf(renterRes).code).toBe('FORBIDDEN_RENTAL_ACTION');

      const ownerRes = await request(app)
        .get('/api/v1/rentals?role=all')
        .set(ownerAuth);
      expect(ownerRes.status).toBe(403);
      expect(errorOf(ownerRes).code).toBe('FORBIDDEN_RENTAL_ACTION');

      const strangerRes = await request(app)
        .get('/api/v1/rentals?role=all')
        .set(strangerAuth);
      expect(strangerRes.status).toBe(403);
      expect(errorOf(strangerRes).code).toBe('FORBIDDEN_RENTAL_ACTION');
    });
  });

  // =========================================================================
  // Scenario 5: Order Detail as Renter
  // =========================================================================
  describe('5. Order Detail as Renter', () => {
    it('returns toy summary, party trust profiles, timeline, and renter financial breakdown without leaking platform fees', async () => {
      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}`)
        .set(renterAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);

      expect(data.id).toBe(baseOrderId);
      expect(data.code).toBeDefined();

      // Order-level pricing must not leak platform fee to the renter either
      expect(data.pricing).toMatchObject({ rentalFee: 150_000, totalPayable: 350_000 });
      expect('platformFee' in data.pricing).toBe(false);
      expect('platformFeeRate' in data.pricing).toBe(false);

      // Toy summary
      expect(data.toy).toMatchObject({
        id: toyId,
        name: 'Lego Star Wars Millennium Falcon',
        primaryImage: 'https://images.example.com/lego-falcon.jpg',
        dailyRate: 50_000,
        depositAmount: 200_000,
      });

      // Party profiles
      expect(data.renter).toMatchObject({
        id: renterId,
        fullName: 'Bob Renter',
        trustScore: 88,
        verified: true,
        role: 'renter',
      });
      expect(data.owner).toMatchObject({
        id: ownerId,
        fullName: 'Alice Owner',
        trustScore: 92,
        verified: true,
        role: 'owner',
      });

      // Timeline
      expect(Array.isArray(data.timeline)).toBe(true);
      expect(data.timeline.length).toBeGreaterThanOrEqual(1);

      // Financial breakdown
      const fb = data.financialBreakdown;
      expect(fb).toBeDefined();
      expect(fb.role).toBe('renter');
      expect(fb.currency).toBe('VND');
      expect(fb.settlementStatus).toBe('PENDING_PAYMENT');
      expect(fb.summary).toBeDefined();
      expect(fb.summary.status).toBe('PENDING_PAYMENT');
      expect(typeof fb.summary.description).toBe('string');

      // Renter items
      expect(fb.items).toMatchObject({
        rentalFee: 150_000,
        depositPaid: 0,
        lateFee: 0,
        depositRefunded: 0,
        totalActualCost: 150_000,
      });

      // Crucial: Renter breakdown does NOT leak platform fee or owner net earnings
      expect(fb.items.platformFeeRate).toBeUndefined();
      expect(fb.items.platformFee).toBeUndefined();
      expect(fb.items.grossRentalFee).toBeUndefined();
      expect(fb.items.lateCompensation).toBeUndefined();
      expect(fb.items.netEarnings).toBeUndefined();
      expect('platformFee' in fb.items).toBe(false);
      expect('platformFeeRate' in fb.items).toBe(false);
      expect('netEarnings' in fb.items).toBe(false);
      expect('grossRentalFee' in fb.items).toBe(false);
      expect(fb.payoutStatus).toBeUndefined();
      expect(fb.platformRevenue).toBeUndefined();
    });

    it('renders settled breakdown for COMPLETED order as renter without leaks', async () => {
      const completedOrder = await createOrderDoc({
        status: 'COMPLETED',
        returnInfo: {
          photos: [],
          requestedAt: new Date('2026-11-07T10:00:00Z'),
          lateDays: 0,
          lateFee: 0,
        },
        settlement: {
          result: 'GOOD',
          settledAt: new Date('2026-11-08T00:00:00Z'),
        },
      });

      const res = await request(app)
        .get(`/api/v1/rentals/${completedOrder._id.toString()}`)
        .set(renterAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      const fb = data.financialBreakdown;

      expect(fb.role).toBe('renter');
      expect(fb.settlementStatus).toBe('SETTLED');
      expect(fb.isEstimated).toBe(false);
      expect(fb.items).toMatchObject({
        rentalFee: 150_000,
        depositPaid: 200_000,
        lateFee: 0,
        depositRefunded: 200_000,
        totalActualCost: 150_000,
      });

      expect('platformFee' in fb.items).toBe(false);
      expect('netEarnings' in fb.items).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 6: Order Detail as Owner
  // =========================================================================
  describe('6. Order Detail as Owner', () => {
    it('returns owner financial breakdown containing grossRentalFee, platformFee, lateCompensation, netEarnings, and payoutStatus', async () => {
      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}`)
        .set(ownerAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);

      expect(data.pricing).toMatchObject({ platformFeeRate: 0.1, platformFee: 15_000 });

      const fb = data.financialBreakdown;
      expect(fb).toBeDefined();
      expect(fb.role).toBe('owner');
      expect(fb.currency).toBe('VND');
      expect(fb.payoutStatus).toBe('WAITING_PAYMENT');
      expect(fb.summary).toBeDefined();
      expect(fb.summary.status).toBe('WAITING_PAYMENT');
      expect(typeof fb.summary.description).toBe('string');

      expect(fb.items).toMatchObject({
        grossRentalFee: 150_000,
        platformFeeRate: 0.1,
        platformFee: 15_000,
        lateCompensation: 0,
        netEarnings: 135_000,
      });
      expect(fb.items.netEarnings).toBe(
        fb.items.grossRentalFee - fb.items.platformFee + fb.items.lateCompensation,
      );
    });

    it('correctly calculates netEarnings with late compensation on completed order', async () => {
      const completedOrder = await createOrderDoc({
        status: 'COMPLETED',
        returnInfo: {
          photos: [],
          requestedAt: new Date('2026-11-08T10:00:00Z'),
          lateDays: 1,
          lateFee: 50_000,
        },
        settlement: {
          result: 'GOOD',
          settledAt: new Date('2026-11-09T00:00:00Z'),
        },
      });

      const res = await request(app)
        .get(`/api/v1/rentals/${completedOrder._id.toString()}`)
        .set(ownerAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      const fb = data.financialBreakdown;

      expect(fb.role).toBe('owner');
      expect(fb.payoutStatus).toBe('PAID_OUT');
      expect(fb.isEstimated).toBe(false);
      expect(fb.items).toMatchObject({
        grossRentalFee: 150_000,
        platformFeeRate: 0.1,
        platformFee: 15_000,
        lateCompensation: 50_000,
        netEarnings: 185_000,
      });
    });
  });

  // =========================================================================
  // Scenario 7: Order Detail as Admin
  // =========================================================================
  describe('7. Order Detail as Admin', () => {
    it('succeeds for admin who is neither renter nor owner and returns admin financial breakdown', async () => {
      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}`)
        .set(adminAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);

      expect(data.id).toBe(baseOrderId);
      expect(data.renter.id).toBe(renterId);
      expect(data.owner.id).toBe(ownerId);

      const fb = data.financialBreakdown;
      expect(fb).toBeDefined();
      expect(fb.role).toBe('admin');
      expect(fb.settlementStatus).toBe('PENDING_PAYMENT');
      expect(fb.payoutStatus).toBe('WAITING_PAYMENT');
      expect(fb.platformRevenue).toBe(0);

      // Admin breakdown has both renter and owner views and items
      expect(fb.items).toBeDefined();
      expect(fb.items.rentalFee).toBe(150_000);
      expect(fb.items.grossRentalFee).toBe(150_000);
      expect(fb.items.platformFee).toBe(15_000);
      expect(fb.items.netEarnings).toBe(135_000);

      expect(fb.renter).toBeDefined();
      expect(fb.renter.role).toBe('renter');
      expect(fb.renter.items.rentalFee).toBe(150_000);

      expect(fb.owner).toBeDefined();
      expect(fb.owner.role).toBe('owner');
      expect(fb.owner.items.netEarnings).toBe(135_000);

      expect(fb.summary).toBeDefined();
      expect(typeof fb.summary.description).toBe('string');
    });
  });

  // =========================================================================
  // Scenario 8: Stranger Privacy
  // =========================================================================
  describe('8. Stranger Privacy', () => {
    it('returns 404 RENTAL_NOT_FOUND when stranger requests order detail', async () => {
      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}`)
        .set(strangerAuth);

      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe('RENTAL_NOT_FOUND');
    });

    it('returns 404 RENTAL_NOT_FOUND when stranger requests order history', async () => {
      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}/history`)
        .set(strangerAuth);

      expect(res.status).toBe(404);
      expect(errorOf(res).code).toBe('RENTAL_NOT_FOUND');
    });

    it('returns empty list when stranger queries their own renter orders', async () => {
      const res = await request(app)
        .get('/api/v1/rentals?role=renter')
        .set(strangerAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);
      expect(data.total).toBe(0);
      expect(data.items).toEqual([]);
    });
  });

  // =========================================================================
  // Scenario 9: Timeline System Actor
  // =========================================================================
  describe('9. Timeline System Actor', () => {
    it('maps SYSTEM_ACTOR_ID in timeline to changedBy.id=null, changedBy.name="Hệ thống", changedBy.role="system", changedBy.isSystem=true', async () => {
      // Add a system-triggered status transition to the order
      await OrderStatusHistory.create({
        orderType: 'RENTAL',
        orderId: new mongoose.Types.ObjectId(baseOrderId),
        oldStatus: 'SHIPPING',
        newStatus: 'IN_USE',
        changedBy: new mongoose.Types.ObjectId(SYSTEM_ACTOR_ID),
        notes: 'system:RECEIPT_CONFIRM - Tự động xác nhận nhận hàng sau 48h',
        occurredAt: new Date('2026-11-03T10:00:00Z'),
      });

      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}`)
        .set(renterAuth);

      expect(res.status).toBe(200);
      const data = unwrap(res);

      expect(Array.isArray(data.timeline)).toBe(true);
      const systemEntry = data.timeline.find((t: any) => t.newStatus === 'IN_USE');
      expect(systemEntry).toBeDefined();

      expect(systemEntry.changedBy).toEqual({
        id: null,
        name: 'Hệ thống',
        role: 'system',
        isSystem: true,
      });

      // Regular user entry should retain user details
      const userEntry = data.timeline.find((t: any) => t.newStatus === 'PENDING');
      expect(userEntry).toBeDefined();
      expect(userEntry.changedBy).toEqual({
        id: renterId,
        name: 'Bob Renter',
        role: 'renter',
        isSystem: false,
      });
    });
  });

  // =========================================================================
  // Scenario 10: Backward Compatibility for /history
  // =========================================================================
  describe('10. Backward Compatibility for /history', () => {
    it('returns an array of entries where changedBy is a plain string (including SYSTEM_ACTOR_ID)', async () => {
      // Accept order as owner so we have multiple history events
      await request(app)
        .post(`/api/v1/rentals/${baseOrderId}/accept`)
        .set(ownerAuth);

      // Add a system event
      await OrderStatusHistory.create({
        orderType: 'RENTAL',
        orderId: new mongoose.Types.ObjectId(baseOrderId),
        oldStatus: 'ACCEPTED',
        newStatus: 'EXPIRED',
        changedBy: new mongoose.Types.ObjectId(SYSTEM_ACTOR_ID),
        notes: 'Hết hạn thanh toán',
        occurredAt: new Date(Date.now() + 10_000),
      });

      const res = await request(app)
        .get(`/api/v1/rentals/${baseOrderId}/history`)
        .set(renterAuth);

      expect(res.status).toBe(200);
      const history = unwrap(res);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(3);

      // All changedBy entries MUST be plain strings for backward compatibility
      for (const entry of history) {
        expect(typeof entry.changedBy).toBe('string');
        expect(typeof entry.newStatus).toBe('string');
        expect(entry.occurredAt).toBeDefined();
      }

      // 1. Initial creation by renter
      expect(history[0].oldStatus).toBeUndefined();
      expect(history[0]).toMatchObject({
        newStatus: 'PENDING',
        changedBy: renterId,
      });

      // 2. Acceptance by owner
      expect(history[1]).toMatchObject({
        oldStatus: 'PENDING',
        newStatus: 'ACCEPTED',
        changedBy: ownerId,
      });

      // 3. System transition
      expect(history[2]).toMatchObject({
        oldStatus: 'ACCEPTED',
        newStatus: 'EXPIRED',
        changedBy: SYSTEM_ACTOR_ID,
      });
    });
  });
});
