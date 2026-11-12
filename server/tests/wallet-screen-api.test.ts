import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RentalOrder } from '../src/models/index.js';
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

  it('lists the history newest first with the pagination envelope', async () => {
    await fund(userId, 100_000);
    await fund(userId, 200_000);
    await fund(userId, 300_000);

    const res = await request(app)
      .get('/api/v1/wallets/me/transactions?page=1&limit=2')
      .set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { amount: number }) => t.amount)).toEqual([300_000, 200_000]);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      totalItems: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });

    const page2 = await request(app)
      .get('/api/v1/wallets/me/transactions?page=2&limit=2')
      .set(authHeader(userId));
    expect(page2.body.data.map((t: { amount: number }) => t.amount)).toEqual([100_000]);
  });

  it('filters by type and by direction', async () => {
    await fund(userId, 500_000);
    await payRental(350_000);

    const rentals = await request(app)
      .get('/api/v1/wallets/me/transactions?type=rental')
      .set(authHeader(userId));
    expect(rentals.body.data).toHaveLength(1);
    expect(rentals.body.data[0]).toMatchObject({
      amount: 350_000,
      type: 'debit',
      reference: { kind: 'rental_order' },
    });

    const credits = await request(app)
      .get('/api/v1/wallets/me/transactions?direction=credit')
      .set(authHeader(userId));
    expect(credits.body.data).toHaveLength(1);
    expect(credits.body.data[0]).toMatchObject({ amount: 500_000, type: 'credit' });

    const topups = await request(app)
      .get('/api/v1/wallets/me/transactions?type=topup')
      .set(authHeader(userId));
    expect(topups.body.data).toEqual([]);
    expect(topups.body.pagination.totalItems).toBe(0);
  });

  it('only shows the signed-in user’s own transactions', async () => {
    const other = (await createUser())._id.toString();
    await fund(other, 900_000);

    const res = await request(app).get('/api/v1/wallets/me/transactions').set(authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects an unknown filter and an anonymous request', async () => {
    const bad = await request(app)
      .get('/api/v1/wallets/me/transactions?type=gift')
      .set(authHeader(userId));
    expect(bad.status).toBe(400);

    const anon = await request(app).get('/api/v1/wallets/me/transactions');
    expect(anon.status).toBe(401);
  });
});
