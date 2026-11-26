import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RentalOrder, Wallet, WalletTransaction } from '../src/models/index.js';
import { withTransaction } from '../src/repositories/transaction.js';
import { WalletLedgerRepository } from '../src/repositories/wallet-ledger.repository.js';
import { authHeader, createUser, fund } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

// Wallet screen: available / held balance and the filtered, paginated history.
describe('Wallet screen API', () => {
  const app = createApp();
  let userId: string;

  const pricing = {
    days: 3,
    dailyRate: 50_000,
    rentalFee: 150_000,
    depositAmount: 200_000,
    platformFeeRate: 0.1,
    platformFee: 15_000,
    totalPayable: 350_000,
  };

  const rentalOrder = (code: string, status: string, renterId: string) => ({
    code,
    toyId: new mongoose.Types.ObjectId(),
    renterId: new mongoose.Types.ObjectId(renterId),
    ownerId: new mongoose.Types.ObjectId(),
    period: { startDate: new Date('2026-11-05'), endDate: new Date('2026-11-07') },
    pricing,
    status,
  });

  /** Moves `amount` from the user's wallet to escrow, like paying a rental. */
  const payRental = async (amount: number) => {
    const ledger = new WalletLedgerRepository();
    const [user, escrow] = await Promise.all([
      ledger.getOrCreateUserWallet(userId),
      ledger.getOrCreateSystemWallet('escrow'),
    ]);
    await withTransaction((session) =>
      ledger.post(
        `rental:${new mongoose.Types.ObjectId().toString()}:pay`,
        { kind: 'rental_order', id: new mongoose.Types.ObjectId().toString() },
        [
          { walletId: user.id, amount: -amount },
          { walletId: escrow.id, amount },
        ],
        session,
        'Thanh toán tiền thuê và tiền cọc',
      ),
    );
  };

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

  it('shows the balance as available and paid, unsettled rentals as held', async () => {
    await fund(userId, 1_000_000);
    await payRental(350_000);
    const other = (await createUser())._id.toString();
    await RentalOrder.create([
      rentalOrder('RO261101AAAA01', 'PAID', userId),
      rentalOrder('RO261101AAAA02', 'DISPUTING', userId),
      rentalOrder('RO261101AAAA03', 'PENDING', userId),
      rentalOrder('RO261101AAAA04', 'COMPLETED', userId),
      rentalOrder('RO261101AAAA05', 'IN_USE', other),
    ]);

    const res = await request(app).get('/api/v1/wallets/me').set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      balance: 650_000,
      availableBalance: 650_000,
      holdingBalance: 700_000,
      holdings: { rentals: 700_000 },
      currency: 'VND',
    });
  });

  it('returns zero held money for a new user', async () => {
    const res = await request(app).get('/api/v1/wallets/me').set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ availableBalance: 0, holdingBalance: 0 });
  });

  it('lists the history newest first in the lead’s list shape', async () => {
    await fund(userId, 100_000);
    await fund(userId, 200_000);
    await fund(userId, 300_000);

    const res = await request(app)
      .get('/api/v1/wallets/me/transactions?page=1&limit=2')
      .set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      total: 3,
      page: 1,
      limit: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
    expect(res.body.data.items.map((t: { amount: number }) => t.amount)).toEqual([300_000, 200_000]);
    expect(res.body.data.items[0]).toMatchObject({
      type: 'credit',
      reference: { kind: 'admin_credit' },
      description: 'Test funding',
    });
    expect(res.body.data.items[0]).toHaveProperty('walletId');
    expect(res.body.data.items[0]).toHaveProperty('postingKey');
    expect(typeof res.body.data.items[0].createdAt).toBe('string');

    const page2 = await request(app)
      .get('/api/v1/wallets/me/transactions?page=2&limit=2')
      .set(authHeader(userId));
    expect(page2.body.data.items.map((t: { amount: number }) => t.amount)).toEqual([100_000]);
    expect(page2.body.data).toMatchObject({ hasNextPage: false, hasPrevPage: true });
  });

  it('uses 20 items per page by default', async () => {
    const res = await request(app).get('/api/v1/wallets/me/transactions').set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
  });

  it('filters by kind (type of transaction) and by type (direction)', async () => {
    await fund(userId, 500_000);
    await payRental(350_000);

    const rentals = await request(app)
      .get('/api/v1/wallets/me/transactions?kind=rental_order')
      .set(authHeader(userId));
    expect(rentals.body.data.items).toHaveLength(1);
    expect(rentals.body.data.items[0]).toMatchObject({
      amount: 350_000,
      type: 'debit',
      reference: { kind: 'rental_order' },
    });

    const credits = await request(app)
      .get('/api/v1/wallets/me/transactions?type=credit')
      .set(authHeader(userId));
    expect(credits.body.data.items).toHaveLength(1);
    expect(credits.body.data.items[0]).toMatchObject({ amount: 500_000, type: 'credit' });

    const everything = await request(app)
      .get('/api/v1/wallets/me/transactions?type=all&kind=all')
      .set(authHeader(userId));
    expect(everything.body.data.total).toBe(2);

    const topups = await request(app)
      .get('/api/v1/wallets/me/transactions?kind=payment')
      .set(authHeader(userId));
    expect(topups.body.data).toMatchObject({ items: [], total: 0 });
  });

  it('filters by date range', async () => {
    await fund(userId, 100_000);
    const today = new Date().toISOString().slice(0, 10);

    const inRange = await request(app)
      .get(`/api/v1/wallets/me/transactions?startDate=2000-01-01&endDate=2999-12-31`)
      .set(authHeader(userId));
    expect(inRange.body.data.total).toBe(1);

    const before = await request(app)
      .get(`/api/v1/wallets/me/transactions?endDate=2000-01-01`)
      .set(authHeader(userId));
    expect(before.body.data.total).toBe(0);

    const reversed = await request(app)
      .get(`/api/v1/wallets/me/transactions?startDate=${today}&endDate=2000-01-01`)
      .set(authHeader(userId));
    expect(reversed.status).toBe(400);
  });

  // E2E 26/11 bug 8: the dates are days in Viet Nam (UTC+7) and the end day is included
  it('filters by calendar day in Viet Nam, both days included', async () => {
    const instants = [
      '2026-11-25T16:59:59.999Z', // 25/11 23:59:59.999 in Viet Nam
      '2026-11-25T17:00:00.000Z', // 26/11 00:00
      '2026-11-26T09:00:00.000Z', // 26/11 16:00
      '2026-11-26T16:59:59.999Z', // 26/11 23:59:59.999
      '2026-11-26T17:00:00.000Z', // 27/11 00:00
    ];
    for (let i = 0; i < instants.length; i += 1) await fund(userId, 10_000 * (i + 1));
    const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean();
    const rows = await WalletTransaction.find({ walletId: wallet!._id }).sort({ _id: 1 }).lean();
    expect(rows).toHaveLength(instants.length);
    // Raw driver update: createdAt is immutable through mongoose
    await Promise.all(
      rows.map((row, i) =>
        WalletTransaction.collection.updateOne(
          { _id: row._id },
          { $set: { createdAt: new Date(instants[i]!) } },
        ),
      ),
    );

    const amounts = async (query: string) => {
      const res = await request(app)
        .get(`/api/v1/wallets/me/transactions?${query}`)
        .set(authHeader(userId));
      expect(res.status).toBe(200);
      return (res.body.data.items as Array<{ amount: number }>).map((t) => t.amount).sort((a, b) => a - b);
    };

    expect(await amounts('startDate=2026-11-26&endDate=2026-11-26')).toEqual([20_000, 30_000, 40_000]);
    expect(await amounts('startDate=2026-11-25&endDate=2026-11-25')).toEqual([10_000]);
    expect(await amounts('endDate=2026-11-25')).toEqual([10_000]);
    expect(await amounts('startDate=2026-11-27')).toEqual([50_000]);
    expect(await amounts('startDate=2026-11-25&endDate=2026-11-27')).toEqual([
      10_000, 20_000, 30_000, 40_000, 50_000,
    ]);
  });

  it('only shows the signed-in user’s own transactions', async () => {
    const other = (await createUser())._id.toString();
    await fund(other, 900_000);

    const res = await request(app).get('/api/v1/wallets/me/transactions').set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('rejects a bad filter and an anonymous request', async () => {
    const badType = await request(app)
      .get('/api/v1/wallets/me/transactions?type=gift')
      .set(authHeader(userId));
    expect(badType.status).toBe(400);
    expect(badType.body.error.code).toBe('VALIDATION_ERROR');

    const badLimit = await request(app)
      .get('/api/v1/wallets/me/transactions?limit=500')
      .set(authHeader(userId));
    expect(badLimit.status).toBe(400);

    const anon = await request(app).get('/api/v1/wallets/me/transactions');
    expect(anon.status).toBe(401);
  });
});
