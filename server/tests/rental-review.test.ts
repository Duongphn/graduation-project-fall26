import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatusHistory } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('UC07: Owner Review, List, Detail and History', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let strangerId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let strangerAuth: any;
  let orderId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

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

    const owner = await createUser({ fullName: 'Toy Owner' });
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser({ fullName: 'Toy Renter', trust: { score: 80 } });
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const stranger = await createUser({ fullName: 'Stranger' });
    strangerId = stranger._id.toString();
    strangerAuth = authHeader(strangerId);

    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();

    // Create a pending rental order
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    orderId = unwrap(created).id;
  });

  it('accept moves PENDING -> ACCEPTED with a 12h payment timer', async () => {
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/accept`)
      .set(ownerAuth);

    expect(res.status).toBe(200);
    expect(unwrap(res)).toMatchObject({
      status: 'ACCEPTED',
      timer: {
        kind: 'PAYMENT',
        dueAt: '2026-11-01T15:00:00.000Z',
      },
    });

    const histories = await OrderStatusHistory.find({ orderId: new mongoose.Types.ObjectId(orderId) });
    expect(histories).toHaveLength(2); // PENDING, ACCEPTED
    expect(histories[1]!.newStatus).toBe('ACCEPTED');

    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
  });

  it('reject requires a reason and releases the calendar', async () => {
    const shortReason = await request(app)
      .post(`/api/v1/rentals/${orderId}/reject`)
      .set(ownerAuth)
      .send({ reason: 'abc' });
    expect(shortReason.status).toBe(400);

    const validReject = await request(app)
      .post(`/api/v1/rentals/${orderId}/reject`)
      .set(ownerAuth)
      .send({ reason: 'Đồ chơi đang được bảo trì đột xuất' });
    expect(validReject.status).toBe(200);
    expect(unwrap(validReject)).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Đồ chơi đang được bảo trì đột xuất',
    });
    expect(unwrap(validReject).timer).toBeUndefined();

    // Calendar is released: another booking on same dates succeeds
    const newBooking = await request(app)
      .post('/api/v1/rentals')
      .set(strangerAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    expect(newBooking.status).toBe(201);
  });

  it('only the owner can review', async () => {
    const renterAttempt = await request(app)
      .post(`/api/v1/rentals/${orderId}/accept`)
      .set(renterAuth);
    expect(renterAttempt.status).toBe(403);
    expect(errorOf(renterAttempt).code).toBe('FORBIDDEN_RENTAL_ACTION');

    const strangerAttempt = await request(app)
      .post(`/api/v1/rentals/${orderId}/accept`)
      .set(strangerAuth);
    expect(strangerAttempt.status).toBe(404);
    expect(errorOf(strangerAttempt).code).toBe('RENTAL_NOT_FOUND');

    const malformed = await request(app)
      .post('/api/v1/rentals/not-an-id/accept')
      .set(ownerAuth);
    expect(malformed.status).toBe(404);
  });

  it('cannot accept twice', async () => {
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    const second = await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('INVALID_RENTAL_TRANSITION');
  });

  it('owner detail shows renter trust, renter detail does not', async () => {
    const ownerView = await request(app).get(`/api/v1/rentals/${orderId}`).set(ownerAuth);
    expect(ownerView.status).toBe(200);
    expect(unwrap(ownerView).renter).toMatchObject({
      fullName: 'Toy Renter',
      trustScore: 80,
      verified: true,
    });

    const renterView = await request(app).get(`/api/v1/rentals/${orderId}`).set(renterAuth);
    expect(renterView.status).toBe(200);
    expect(unwrap(renterView).renter).toBeUndefined();
  });

  it('list filters by role and status', async () => {
    const renterList = await request(app).get('/api/v1/rentals?role=renter').set(renterAuth);
    expect(renterList.status).toBe(200);
    expect(unwrap(renterList).total).toBe(1);

    const ownerPending = await request(app).get('/api/v1/rentals?role=owner&status=PENDING').set(ownerAuth);
    expect(ownerPending.status).toBe(200);
    expect(unwrap(ownerPending).total).toBe(1);

    const ownerAccepted = await request(app).get('/api/v1/rentals?role=owner&status=ACCEPTED').set(ownerAuth);
    expect(ownerAccepted.status).toBe(200);
    expect(unwrap(ownerAccepted).total).toBe(0);
  });

  it('history lists transitions in order', async () => {
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

    const res = await request(app).get(`/api/v1/rentals/${orderId}/history`).set(renterAuth);
    expect(res.status).toBe(200);
    const history = unwrap(res);
    expect(history.map((h: any) => h.newStatus)).toEqual(['PENDING', 'ACCEPTED']);
  });
});
