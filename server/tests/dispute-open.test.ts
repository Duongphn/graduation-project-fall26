import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Dispute, RentalOrder } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const RECEIVED_AT = '2026-11-05T03:00:00Z';
const VALID_DESCRIPTION = 'Đồ chơi bị nứt phần thân ngay khi mở hộp.';

describe('UC17: open a dispute on a rental order', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let photoStorage: any;
  let ownerId: string;
  let renterId: string;
  let adminId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let orderId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  const keptPhotos = (): string[] =>
    photoStorage.uploaded.filter((id: string) => !photoStorage.deleted.includes(id));

  const openDispute = (
    auth: any,
    fields: { reason?: string; description?: string } = {},
    photos = 1,
  ) => {
    let req = request(app)
      .post(`/api/v1/rentals/${orderId}/disputes`)
      .set(auth)
      .field('reason', fields.reason ?? 'DAMAGED_ON_RECEIPT')
      .field('description', fields.description ?? VALID_DESCRIPTION);
    for (let i = 0; i < photos; i += 1) {
      req = req.attach('photos', JPEG, `evidence-${i}.jpg`);
    }
    return req;
  };

  const returnToy = async () => {
    clock.set('2026-11-07T10:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
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
    photoStorage = built.photoStorage;

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const admin = await createUser({ role: 'ADMIN' });
    adminId = admin._id.toString();

    const toy = await createRentToy(ownerId);

    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    orderId = unwrap(created).id;

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);

    clock.set('2026-11-04T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');

    clock.set(RECEIVED_AT);
    const received = await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
    expect(unwrap(received).status).toBe('IN_USE');
  });

  it('lets the renter complain within 24 hours of receiving', async () => {
    clock.set(RECEIVED_AT);
    clock.advanceHours(23);
    notifier.sent.length = 0;

    const res = await openDispute(renterAuth);

    expect(res.status).toBe(201);
    const { dispute, order } = unwrap(res);
    expect(order.status).toBe('DISPUTING');
    expect(order.disputeId).toBe(dispute.id);
    expect(order.timer).toBeUndefined();
    expect(dispute).toMatchObject({
      status: 'open',
      claimantRole: 'renter',
      claimantId: renterId,
      respondentId: ownerId,
      reason: 'DAMAGED_ON_RECEIPT',
      description: VALID_DESCRIPTION,
    });
    expect(dispute.code).toMatch(/^DP/);
    expect(dispute.evidencePhotos).toHaveLength(1);
    expect(new Date(dispute.responseDueAt).getTime()).toBe(clock.now().getTime() + 72 * 3_600_000);

    expect(notifier.sent.some((n: any) => n.userId === ownerId)).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === adminId)).toBe(true);
  });

  it('closes the renter window after 24 hours', async () => {
    clock.set(RECEIVED_AT);
    clock.advanceHours(24);
    const keptBefore = keptPhotos().length;

    const res = await openDispute(renterAuth);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('COMPLAINT_WINDOW_CLOSED');
    expect((await RentalOrder.findById(orderId))?.status).toBe('IN_USE');
    expect(keptPhotos()).toHaveLength(keptBefore);
  });

  it('lets the owner complain during the 48-hour inspection', async () => {
    await returnToy();
    clock.advanceHours(1);
    notifier.sent.length = 0;

    const res = await openDispute(ownerAuth, { reason: 'MISSING_PARTS' });

    expect(res.status).toBe(201);
    const { dispute, order } = unwrap(res);
    expect(order.status).toBe('DISPUTING');
    expect(order.disputeId).toBe(dispute.id);
    expect(order.settlement).toMatchObject({
      result: 'DAMAGED',
      description: VALID_DESCRIPTION,
      disputeId: dispute.id,
    });
    expect(order.settlement.evidencePhotos).toHaveLength(1);
    expect(dispute).toMatchObject({
      claimantRole: 'owner',
      claimantId: ownerId,
      respondentId: renterId,
      reason: 'MISSING_PARTS',
    });
    expect(
      notifier.sent.some(
        (n: any) => n.userId === renterId && n.title === 'Đơn thuê có khiếu nại đồ chơi bị hỏng',
      ),
    ).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === adminId)).toBe(true);
  });

  it('closes the owner window when the SETTLEMENT timer is over', async () => {
    await returnToy();
    const returned = await RentalOrder.findById(orderId);
    expect(returned?.timer?.kind).toBe('SETTLEMENT');
    clock.set(returned!.timer!.dueAt!);

    const res = await openDispute(ownerAuth, { reason: 'MISSING_PARTS' });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('COMPLAINT_WINDOW_CLOSED');
    expect((await RentalOrder.findById(orderId))?.status).toBe('RETURNING');
  });

  it('refuses a dispute in the wrong order status', async () => {
    // The owner cannot complain while the toy is still with the renter.
    const res = await openDispute(ownerAuth, { reason: 'MISSING_PARTS' });
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('INVALID_RENTAL_TRANSITION');
  });

  it('takes only the reasons of the claimant', async () => {
    clock.advanceHours(1);
    const uploadedBefore = photoStorage.uploaded.length;

    const res = await openDispute(renterAuth, { reason: 'DAMAGED_ON_RETURN' });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(photoStorage.uploaded).toHaveLength(uploadedBefore);
  });

  it('needs 1 to 10 photos and a 10–1000 character description', async () => {
    clock.advanceHours(1);

    const noPhotos = await openDispute(renterAuth, {}, 0);
    expect(noPhotos.status).toBe(400);
    expect(errorOf(noPhotos).code).toBe('INVALID_IMAGE_UPLOAD');

    const shortDescription = await openDispute(renterAuth, { description: '123456789' });
    expect(shortDescription.status).toBe(400);
    expect(errorOf(shortDescription).code).toBe('VALIDATION_ERROR');

    expect((await RentalOrder.findById(orderId))?.status).toBe('IN_USE');
    expect(await Dispute.countDocuments()).toBe(0);
  });

  it('refuses a second dispute for the same order', async () => {
    clock.advanceHours(1);
    const first = await openDispute(renterAuth);
    expect(first.status).toBe(201);

    const second = await openDispute(renterAuth);
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('DISPUTE_ALREADY_EXISTS');
  });

  it('opens only one of two concurrent complaints', async () => {
    clock.advanceHours(1);
    const keptBefore = keptPhotos().length;

    const results = await Promise.all([openDispute(renterAuth), openDispute(renterAuth)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Dispute.countDocuments()).toBe(1);
    const dispute = await Dispute.findOne();
    expect(keptPhotos().length - keptBefore).toBe(dispute!.evidencePhotos.length);
  });

  it('stops the rental timers once disputed', async () => {
    clock.advanceHours(1);
    const res = await openDispute(renterAuth);
    expect(res.status).toBe(201);

    // lean(): a hydrated doc shows an unset nested path as {}
    const stored = await RentalOrder.findById(orderId).lean();
    expect(stored?.timer).toBeUndefined();

    // Far past every rental deadline: the scheduler must leave the disputed order alone.
    clock.set('2026-12-31T00:00:00Z');
    const timerService = (app as any).locals.container.rentalTimerService;
    await timerService.runDue();

    expect((await RentalOrder.findById(orderId))?.status).toBe('DISPUTING');
  });

  it('hides the order from outsiders', async () => {
    clock.advanceHours(1);
    const stranger = await createUser();

    const res = await openDispute(authHeader(stranger._id.toString()));

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('RENTAL_NOT_FOUND');
  });
  it('opens the same dispute through the old settle endpoint', async () => {
    await returnToy();

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .field('result', 'DAMAGED')
      .field('description', VALID_DESCRIPTION)
      .attach('photos', JPEG, 'damaged.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('DISPUTING');
    expect(data.disputeId).toBeDefined();
    expect(data.disputeId).toBe(data.settlement.disputeId);

    const dispute = await Dispute.findById(data.disputeId);
    expect(dispute).toMatchObject({ claimantRole: 'owner', reason: 'DAMAGED_ON_RETURN' });
    expect(dispute?.timer?.dueAt).toBeInstanceOf(Date);
  });
});
