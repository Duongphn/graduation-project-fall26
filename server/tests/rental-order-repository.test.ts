import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RentalOrder } from '../src/models/rental-order.model.js';
import { Toy } from '../src/models/toy.model.js';
import { User } from '../src/models/user.model.js';
import { RentalOrderRepository } from '../src/repositories/rental-order.repository.js';
import { formatDateOnly, parseDateOnly } from '../src/services/rental-time.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('RentalOrderRepository', () => {
  const repo = new RentalOrderRepository();
  const d = (s: string) => parseDateOnly(s)!;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns only calendar-holding orders that overlap', async () => {
    const toyId = new mongoose.Types.ObjectId().toString();
    const otherToyId = new mongoose.Types.ObjectId().toString();
    const renterId = new mongoose.Types.ObjectId();
    const ownerId = new mongoose.Types.ObjectId();

    const pricing = {
      days: 3,
      dailyRate: 50_000,
      rentalFee: 150_000,
      depositAmount: 200_000,
      platformFeeRate: 0.1,
      platformFee: 15_000,
      totalPayable: 350_000,
    };

    // seed orders for one toy: PENDING 11-05..11-07, REJECTED 11-08..11-09, DISPUTING 11-20..11-21, other toy PENDING 11-05..11-07
    await RentalOrder.create([
      {
        code: 'RO261101A1B2C3',
        toyId: new mongoose.Types.ObjectId(toyId),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-05'), endDate: d('2026-11-07') },
        pricing,
        status: 'PENDING',
      },
      {
        code: 'RO261101A1B2C4',
        toyId: new mongoose.Types.ObjectId(toyId),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-08'), endDate: d('2026-11-09') },
        pricing,
        status: 'REJECTED',
      },
      {
        code: 'RO261101A1B2C5',
        toyId: new mongoose.Types.ObjectId(toyId),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-20'), endDate: d('2026-11-21') },
        pricing,
        status: 'DISPUTING',
      },
      {
        code: 'RO261101A1B2C6',
        toyId: new mongoose.Types.ObjectId(otherToyId),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-05'), endDate: d('2026-11-07') },
        pricing,
        status: 'PENDING',
      },
    ]);

    const occupied = await repo.findOccupied(toyId, d('2026-11-01'), d('2026-11-30'));
    expect(occupied.map((p) => formatDateOnly(p.startDate))).toEqual(['2026-11-05', '2026-11-20']);
    expect(await repo.findOccupied(toyId, d('2026-11-08'), d('2026-11-19'))).toEqual([]);
  });

  it('lists by party role and status, newest first', async () => {
    const renterId = new mongoose.Types.ObjectId().toString();
    const ownerId = new mongoose.Types.ObjectId().toString();
    const strangerId = new mongoose.Types.ObjectId().toString();

    const pricing = {
      days: 3,
      dailyRate: 50_000,
      rentalFee: 150_000,
      depositAmount: 200_000,
      platformFeeRate: 0.1,
      platformFee: 15_000,
      totalPayable: 350_000,
    };

    await RentalOrder.create([
      {
        code: 'RO261101A1B2C1',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(renterId),
        ownerId: new mongoose.Types.ObjectId(ownerId),
        period: { startDate: d('2026-11-01'), endDate: d('2026-11-03') },
        pricing,
        status: 'PENDING',
        createdAt: new Date('2026-11-01T01:00:00Z'),
      },
      {
        code: 'RO261101A1B2C2',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(renterId),
        ownerId: new mongoose.Types.ObjectId(ownerId),
        period: { startDate: d('2026-11-04'), endDate: d('2026-11-06') },
        pricing,
        status: 'ACCEPTED',
        createdAt: new Date('2026-11-01T02:00:00Z'),
      },
    ]);

    const renterList = await repo.listForParty(renterId, 'renter', undefined, 1, 10);
    expect(renterList.total).toBe(2);
    expect(renterList.items[0]!.code).toBe('RO261101A1B2C2');

    const ownerPending = await repo.listForParty(ownerId, 'owner', 'PENDING', 1, 10);
    expect(ownerPending.total).toBe(1);
    expect(ownerPending.items[0]!.code).toBe('RO261101A1B2C1');

    const ownerAccepted = await repo.listForParty(ownerId, 'owner', 'ACCEPTED', 1, 10);
    expect(ownerAccepted.total).toBe(1);

    const strangerList = await repo.listForParty(strangerId, 'renter', undefined, 1, 10);
    expect(strangerList.total).toBe(0);
  });

  it('supports status array filter to match multiple statuses', async () => {
    const renterId = new mongoose.Types.ObjectId().toString();
    const ownerId = new mongoose.Types.ObjectId().toString();
    const pricing = {
      days: 3,
      dailyRate: 50_000,
      rentalFee: 150_000,
      depositAmount: 200_000,
      platformFeeRate: 0.1,
      platformFee: 15_000,
      totalPayable: 350_000,
    };

    await RentalOrder.create([
      {
        code: 'RO261101A1B2S1',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(renterId),
        ownerId: new mongoose.Types.ObjectId(ownerId),
        period: { startDate: d('2026-11-01'), endDate: d('2026-11-03') },
        pricing,
        status: 'PENDING',
      },
      {
        code: 'RO261101A1B2S2',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(renterId),
        ownerId: new mongoose.Types.ObjectId(ownerId),
        period: { startDate: d('2026-11-04'), endDate: d('2026-11-06') },
        pricing,
        status: 'ACCEPTED',
      },
      {
        code: 'RO261101A1B2S3',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(renterId),
        ownerId: new mongoose.Types.ObjectId(ownerId),
        period: { startDate: d('2026-11-07'), endDate: d('2026-11-09') },
        pricing,
        status: 'COMPLETED',
      },
    ]);

    const res = await repo.listForParty(renterId, 'renter', ['PENDING', 'ACCEPTED'], 1, 10);
    expect(res.total).toBe(2);
    expect(res.items.map((i) => i.code).sort()).toEqual(['RO261101A1B2S1', 'RO261101A1B2S2']);
  });

  it('supports role="all" to return orders across multiple parties without user filtering', async () => {
    const user1Id = new mongoose.Types.ObjectId().toString();
    const user2Id = new mongoose.Types.ObjectId().toString();
    const user3Id = new mongoose.Types.ObjectId().toString();
    const pricing = {
      days: 2,
      dailyRate: 40_000,
      rentalFee: 80_000,
      depositAmount: 100_000,
      platformFeeRate: 0.1,
      platformFee: 8_000,
      totalPayable: 180_000,
    };

    await RentalOrder.create([
      {
        code: 'RO261101ALL001',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(user1Id),
        ownerId: new mongoose.Types.ObjectId(user2Id),
        period: { startDate: d('2026-11-01'), endDate: d('2026-11-02') },
        pricing,
        status: 'PENDING',
      },
      {
        code: 'RO261101ALL002',
        toyId: new mongoose.Types.ObjectId(),
        renterId: new mongoose.Types.ObjectId(user3Id),
        ownerId: new mongoose.Types.ObjectId(user2Id),
        period: { startDate: d('2026-11-03'), endDate: d('2026-11-04') },
        pricing,
        status: 'ACCEPTED',
      },
    ]);

    const adminId = new mongoose.Types.ObjectId().toString();
    const resAll = await repo.listForParty(adminId, 'all', undefined, 1, 10);
    expect(resAll.total).toBe(2);
    expect(resAll.items.map((i) => i.code).sort()).toEqual(['RO261101ALL001', 'RO261101ALL002']);
  });

  it('batch-enriches items with toy and counterpart metadata', async () => {
    const renter = await User.create({
      phone: '0901234567',
      email: 'renter@example.com',
      passwordHash: 'dummyhash',
      fullName: 'Nguyen Van Renter',
      avatar: 'https://example.com/renter-avatar.jpg',
      role: 'USER',
      status: 'ACTIVE',
      verificationStatus: 'verified',
      trust: { score: 95 },
    });

    const owner = await User.create({
      phone: '0907654321',
      email: 'owner@example.com',
      passwordHash: 'dummyhash',
      fullName: 'Tran Thi Owner',
      avatar: 'https://example.com/owner-avatar.jpg',
      role: 'USER',
      status: 'ACTIVE',
      verificationStatus: 'verified',
      trust: { score: 88 },
    });

    const toy = await Toy.create({
      ownerId: owner._id,
      categoryId: new mongoose.Types.ObjectId(),
      title: 'Lego Technic 42115 Lamborghini',
      description: 'Mo hinh sieu xe Lego Technic',
      condition: 'like-new',
      listingType: 'rent',
      priceOrRate: 75_000,
      depositPrice: 800_000,
      status: 'active',
      ageRange: { minAge: 14, maxAge: 99 },
      quantity: 1,
      bookingVersion: 0,
      images: [
        { url: 'https://example.com/lego-primary.jpg', publicId: 'lego_primary' },
        { url: 'https://example.com/lego-secondary.jpg', publicId: 'lego_sec' },
      ],
    });

    const pricing = {
      days: 4,
      dailyRate: 75_000,
      rentalFee: 300_000,
      depositAmount: 800_000,
      platformFeeRate: 0.1,
      platformFee: 30_000,
      totalPayable: 1_100_000,
    };

    await RentalOrder.create({
      code: 'RO261101ENRICH1',
      toyId: toy._id,
      renterId: renter._id,
      ownerId: owner._id,
      period: { startDate: d('2026-11-10'), endDate: d('2026-11-13') },
      pricing,
      status: 'IN_USE',
    });

    // Query as renter
    const renterRes = await repo.listForParty(renter._id.toString(), 'renter', undefined, 1, 10);
    expect(renterRes.total).toBe(1);
    const renterItem = renterRes.items[0]!;
    expect(renterItem.role).toBe('renter');

    // Check toy enrichment
    expect(renterItem.toy).toBeDefined();
    expect(renterItem.toy!.id).toBe(toy._id.toString());
    expect(renterItem.toy!.name).toBe('Lego Technic 42115 Lamborghini');
    expect(renterItem.toy!.slug).toBe('lego-technic-42115-lamborghini');
    expect(renterItem.toy!.primaryImage).toBe('https://example.com/lego-primary.jpg');
    expect(renterItem.toy!.dailyRate).toBe(75_000);
    expect(renterItem.toy!.depositAmount).toBe(800_000);

    // Check counterpart enrichment (counterpart of renter is owner)
    expect(renterItem.counterpart).toBeDefined();
    expect(renterItem.counterpart!.id).toBe(owner._id.toString());
    expect(renterItem.counterpart!.fullName).toBe('Tran Thi Owner');
    expect(renterItem.counterpart!.avatar).toBe('https://example.com/owner-avatar.jpg');
    expect(renterItem.counterpart!.trustScore).toBe(88);
    expect(renterItem.counterpart!.verified).toBe(true);
    expect(renterItem.counterpart!.role).toBe('owner');

    // Query as owner
    const ownerRes = await repo.listForParty(owner._id.toString(), 'owner', undefined, 1, 10);
    expect(ownerRes.total).toBe(1);
    const ownerItem = ownerRes.items[0]!;
    expect(ownerItem.role).toBe('owner');

    // Counterpart of owner is renter
    expect(ownerItem.counterpart).toBeDefined();
    expect(ownerItem.counterpart!.id).toBe(renter._id.toString());
    expect(ownerItem.counterpart!.fullName).toBe('Nguyen Van Renter');
    expect(ownerItem.counterpart!.avatar).toBe('https://example.com/renter-avatar.jpg');
    expect(ownerItem.counterpart!.trustScore).toBe(95);
    expect(ownerItem.counterpart!.verified).toBe(true);
    expect(ownerItem.counterpart!.role).toBe('renter');
  });

  it('supports constructor injection of Toy and User models', async () => {
    const customRepo = new RentalOrderRepository(RentalOrder, Toy, User);
    expect(customRepo).toBeInstanceOf(RentalOrderRepository);
  });

  it('finds due timers oldest first', async () => {
    const renterId = new mongoose.Types.ObjectId();
    const ownerId = new mongoose.Types.ObjectId();
    const pricing = {
      days: 3,
      dailyRate: 50_000,
      rentalFee: 150_000,
      depositAmount: 200_000,
      platformFeeRate: 0.1,
      platformFee: 15_000,
      totalPayable: 350_000,
    };

    // orders with timer.dueAt at 10:00, 09:00 and 12:00; findDue(11:00, 100)
    await RentalOrder.create([
      {
        code: 'RO261101T00001',
        toyId: new mongoose.Types.ObjectId(),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-05'), endDate: d('2026-11-07') },
        pricing,
        status: 'PENDING',
        timer: { kind: 'OWNER_RESPONSE', dueAt: new Date('2026-11-01T10:00:00Z') },
      },
      {
        code: 'RO261101T00002',
        toyId: new mongoose.Types.ObjectId(),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-05'), endDate: d('2026-11-07') },
        pricing,
        status: 'ACCEPTED',
        timer: { kind: 'PAYMENT', dueAt: new Date('2026-11-01T09:00:00Z') },
      },
      {
        code: 'RO261101T00003',
        toyId: new mongoose.Types.ObjectId(),
        renterId,
        ownerId,
        period: { startDate: d('2026-11-05'), endDate: d('2026-11-07') },
        pricing,
        status: 'PENDING',
        timer: { kind: 'OWNER_RESPONSE', dueAt: new Date('2026-11-01T12:00:00Z') },
      },
    ]);

    const due = await repo.findDue(new Date('2026-11-01T11:00:00Z'), 100);
    expect(due.map((x) => x.kind)).toEqual(['PAYMENT', 'OWNER_RESPONSE']);
  });

  it('generates codes in the documented format', () => {
    expect(repo.generateCode(new Date('2026-11-01T17:30:00Z'))).toMatch(/^RO261102[A-HJ-NP-Z2-9]{6}$/);
  });
});
