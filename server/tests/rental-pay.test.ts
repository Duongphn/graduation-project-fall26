import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Wallet, WalletTransaction } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('UC08: Pay Rental Order into Escrow', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let ledger: any;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let orderId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  const sumBalances = async () => {
    const res = await Wallet.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    return res[0]?.total ?? 0;
  };

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
    notifier = built.notifier;
    ledger = built.ledger;

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const toy = await createRentToy(ownerId); // priceOrRate: 50k, deposit: 200k
    toyId = toy._id.toString();

    // Create 3-day rental: 150k rent + 200k deposit = 350k totalPayable
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    orderId = unwrap(created).id;

    // Owner accepts
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
  });

  it('pays from wallet into escrow', async () => {
    await fund(renterId, 400_000);

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/pay`)
      .set(renterAuth);

    expect(res.status).toBe(200);
    expect(unwrap(res)).toMatchObject({
      status: 'PAID',
    });
    expect(unwrap(res).timer).toBeUndefined();

    const renterWallet = await ledger.getOrCreateUserWallet(renterId);
    const escrowWallet = await ledger.getOrCreateSystemWallet('escrow');

    expect(renterWallet.balance).toBe(50_000);
    expect(escrowWallet.balance).toBe(350_000);
    expect(await sumBalances()).toBe(0);

    expect(notifier.sent.some((n: any) => n.userId === ownerId)).toBe(true);
  });

  // Review Focus #1
  it('exact balance is enough', async () => {
    await fund(renterId, 350_000);

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/pay`)
      .set(renterAuth);

    expect(res.status).toBe(200);
    const renterWallet = await ledger.getOrCreateUserWallet(renterId);
    expect(renterWallet.balance).toBe(0);
  });

  it('insufficient balance suggests top-up', async () => {
    await fund(renterId, 100_000);

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/pay`)
      .set(renterAuth);

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      details: {
        required: 350_000,
        balance: 100_000,
        shortfall: 250_000,
      },
    });

    const checkOrder = await request(app).get(`/api/v1/rentals/${orderId}`).set(renterAuth);
    expect(unwrap(checkOrder).status).toBe('ACCEPTED');
    expect(await WalletTransaction.countDocuments({ postingKey: `rental:${orderId}:pay` })).toBe(0);
  });

  it('rejects payment after the deadline', async () => {
    await fund(renterId, 400_000);

    // Deadline was 12h: accepted at 03:00Z -> deadline 15:00Z
    clock.set('2026-11-01T15:00:00Z');

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/pay`)
      .set(renterAuth);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('INVALID_RENTAL_TRANSITION');

    const renterWallet = await ledger.getOrCreateUserWallet(renterId);
    expect(renterWallet.balance).toBe(400_000);
  });

  it('only the renter can pay', async () => {
    await fund(ownerId, 400_000);

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/pay`)
      .set(ownerAuth);

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN_RENTAL_ACTION');
  });

  it('cannot pay twice', async () => {
    await fund(renterId, 800_000);

    const first = await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    expect(second.status).toBe(409);

    const renterWallet = await ledger.getOrCreateUserWallet(renterId);
    expect(renterWallet.balance).toBe(450_000); // 800k - 350k debited once
  });
});
