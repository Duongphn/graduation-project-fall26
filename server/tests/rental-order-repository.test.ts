import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RentalOrder } from '../src/models/rental-order.model.js';
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
