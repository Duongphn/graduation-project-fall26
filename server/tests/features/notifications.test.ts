import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Notification } from '../../src/models/notification.model.js';
import { notificationsRouter } from '../../src/routes/notification.routes.js';
import { subscribeNotifications } from '../../src/services/notification.subscriptions.js';
import {
  createTransportMailer,
  maskEmail,
  type Mailer,
  type MailMessage,
} from '../../src/integrations/email/notification-mailer.js';
import {
  donationRecipients,
  renderDonationStatusChanged,
  renderToyReviewed,
} from '../../src/services/notification.templates.js';
import { Organization } from '../../src/models/organization.model.js';
import { User } from '../../src/models/user.model.js';
import type { DonationStatusChangedEvent } from '../../src/utils/domain-events.js';
import { domainEvents } from '../../src/utils/domain-events.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const context = { appPublicUrl: 'https://toyflow.test/' };

let phoneSeq = 0;
const createUser = (email = `user${phoneSeq}@example.com`) =>
  User.create({
    phone: `+8491${String(++phoneSeq).padStart(7, '0')}`,
    email,
    passwordHash: 'x',
    fullName: 'Nguyen Van A',
  });

// Signed-in user from a test header (request.auth is what the real auth middleware sets).
const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/notifications', notificationsRouter);
app.use(errorHandler);

const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 50; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out');
};

const donationEvent = (
  overrides: Partial<DonationStatusChangedEvent> = {},
): DonationStatusChangedEvent => ({
  type: 'DONATION_STATUS_CHANGED',
  donationRequestId: String(newId()),
  toyId: String(newId()),
  toyTitle: 'Bộ xếp hình <gỗ>',
  donorId: String(newId()),
  requestedBy: String(newId()),
  receiverType: 'USER',
  from: 'shipping',
  to: 'completed',
  ...overrides,
});

describe('notification templates', () => {
  it('renders a rejected toy with the reason and an escaped email', () => {
    const message = renderToyReviewed(
      {
        type: 'TOY_REVIEWED',
        toyId: '67098e1b34e12c001a123456',
        ownerId: String(newId()),
        toyTitle: 'Xe <b>',
        decision: 'rejected',
        reason: 'Ảnh bị mờ',
        reviewedBy: String(newId()),
      },
      context,
    );
    expect(message.type).toBe('TOY_REVIEWED');
    expect(message.target).toEqual({ kind: 'TOY', id: '67098e1b34e12c001a123456' });
    expect(message.body).toContain('Lý do: Ảnh bị mờ.');
    expect(message.email.html).toContain('Xe &lt;b&gt;');
    expect(message.email.text).toContain(
      'https://toyflow.test/my/listings/67098e1b34e12c001a123456',
    );
  });

  it('thanks the donor on COMPLETED', () => {
    const message = renderDonationStatusChanged(donationEvent(), 'DONOR', {
      ...context,
      organizationName: 'Mái ấm Hoa Mai',
    });
    expect(message.title).toContain('Cảm ơn bạn đã quyên góp');
    expect(message.body).toContain('cho Mái ấm Hoa Mai');
    expect(message.target.kind).toBe('DONATION_REQUEST');
  });

  it('notifies the right parties and never the actor', () => {
    const event = donationEvent();
    const parties = (overrides: Partial<DonationStatusChangedEvent>) =>
      donationRecipients({ ...event, ...overrides }).map((r) => r.party);
    expect(parties({ to: 'pending', changedBy: event.requestedBy })).toEqual(['DONOR']);
    expect(parties({ to: 'accepted', changedBy: event.donorId })).toEqual(['REQUESTER']);
    expect(parties({ to: 'accepted', changedBy: String(newId()) })).toEqual(['REQUESTER', 'DONOR']);
    expect(parties({ to: 'shipping', changedBy: event.donorId })).toEqual(['REQUESTER']);
    expect(parties({ to: 'completed', changedBy: event.requestedBy })).toEqual(['DONOR']);
    expect(parties({ to: 'cancelled', changedBy: event.requestedBy })).toEqual(['DONOR']);
    expect(parties({ to: 'cancelled' })).toEqual(['DONOR', 'REQUESTER']);
  });

  it('sends the requester side of an ORGANIZATION request to every Admin but the actor', () => {
    const [adminA, adminB] = [String(newId()), String(newId())];
    const event = donationEvent({
      receiverType: 'ORGANIZATION',
      organizationId: String(newId()),
      requestedBy: adminA,
      to: 'accepted',
      changedBy: adminA,
    });
    expect(donationRecipients(event, [adminA, adminB])).toEqual([
      { party: 'REQUESTER', userId: adminB },
      { party: 'DONOR', userId: event.donorId },
    ]);
  });

  it('masks email addresses in logs', () => {
    expect(maskEmail('another@example.com')).toBe('an***@example.com');
  });
});

describe('event subscriptions', () => {
  let sent: MailMessage[];
  let off: () => void;

  beforeEach(async () => {
    await Notification.deleteMany({});
    sent = [];
    const mailer = createTransportMailer(
      {
        sendMail: (options) => {
          sent.push(options as MailMessage);
          return Promise.resolve({});
        },
      },
      'ToyFlow <no-reply@toyflow.test>',
    );
    off = subscribeNotifications({ mailer, appPublicUrl: context.appPublicUrl });
  });

  afterEach(() => off());

  it('creates the in-app notification and sends the email for TOY_REVIEWED', async () => {
    const owner = await createUser('owner@example.com');
    domainEvents.publish({
      type: 'TOY_REVIEWED',
      toyId: String(newId()),
      ownerId: String(owner._id),
      toyTitle: 'Tàu hỏa gỗ',
      decision: 'approved',
      reviewedBy: String(newId()),
    });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    const saved = await Notification.findOne().lean();
    expect(saved).toMatchObject({ type: 'TOY_REVIEWED', isRead: false });
    await waitFor(() => Promise.resolve(sent.length === 1));
    expect(sent[0]).toMatchObject({ to: 'owner@example.com' });
  });

  it('subscribing twice still handles each event once', async () => {
    const user = await createUser();
    off = subscribeNotifications({ mailer: { send: () => Promise.resolve({ delivered: false }) } });
    domainEvents.publish({
      type: 'IDENTITY_REVIEWED',
      verificationId: String(newId()),
      userId: String(user._id),
      decision: 'verified',
      reviewedBy: String(newId()),
    });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('keeps the in-app notification when the email fails', async () => {
    const user = await createUser();
    const failing: Mailer = { send: () => Promise.reject(new Error('SMTP down')) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    off = subscribeNotifications({ mailer: failing });
    domainEvents.publish({
      type: 'IDENTITY_REVIEWED',
      verificationId: String(newId()),
      userId: String(user._id),
      decision: 'rejected',
      reason: 'Ảnh mờ',
      reviewedBy: String(newId()),
    });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    await waitFor(() => Promise.resolve(error.mock.calls.length > 0));
    error.mockRestore();
  });

  it('thanks the donor with the organization name and skips the actor on COMPLETED', async () => {
    const donor = await createUser();
    const requester = await createUser();
    const organization = await Organization.create({
      name: 'Mái ấm Hoa Mai',
      address: '1 Lê Lợi',
      contact_info: '0900000000',
      support_criteria: 'Trẻ 3-6 tuổi',
    });
    domainEvents.publish(
      donationEvent({
        donorId: String(donor._id),
        requestedBy: String(requester._id),
        receiverType: 'ORGANIZATION',
        organizationId: String(organization._id),
        changedBy: String(requester._id),
      }),
    );
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    const saved = await Notification.findOne().lean();
    expect(String(saved?.userId)).toBe(String(donor._id));
    expect(saved?.title).toContain('Cảm ơn');
    expect(saved?.body).toContain('Mái ấm Hoa Mai');
  });

  it('skips unknown users without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    domainEvents.publish(donationEvent({ to: 'shipping', from: 'accepted' }));
    await waitFor(() => Promise.resolve(warn.mock.calls.length > 0));
    expect(await Notification.countDocuments()).toBe(0);
    warn.mockRestore();
  });
});

describe('notifications API', () => {
  const userId = String(newId());
  const otherId = String(newId());
  const seed = (owner: string, isRead = false) =>
    Notification.create({
      userId: owner,
      type: 'TOY_REVIEWED',
      title: 'Tin đăng đã được duyệt',
      body: 'Nội dung',
      isRead,
    });

  beforeEach(async () => {
    await Notification.deleteMany({});
  });

  it('requires a signed-in user', async () => {
    await request(app).get('/api/v1/notifications').expect(401);
    await request(app).patch('/api/v1/notifications/read-all').expect(401);
  });

  it('lists only my notifications, newest first, with unreadOnly', async () => {
    await seed(userId, true);
    await seed(userId);
    await seed(otherId);
    const all = await request(app)
      .get('/api/v1/notifications')
      .set('x-test-user', userId)
      .expect(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.pagination.totalItems).toBe(2);
    expect(all.body.data[0]).not.toHaveProperty('userId');
    expect(all.body.data[0]).not.toHaveProperty('target');
    const unread = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('x-test-user', userId)
      .expect(200);
    expect(unread.body.data).toHaveLength(1);
  });

  it('validates the query and the id', async () => {
    await request(app).get('/api/v1/notifications?limit=0').set('x-test-user', userId).expect(400);
    await request(app).get('/api/v1/notifications?foo=1').set('x-test-user', userId).expect(400);
    await request(app)
      .patch('/api/v1/notifications/abc/read')
      .set('x-test-user', userId)
      .expect(400);
  });

  it('counts unread, marks one read (idempotent) and all read', async () => {
    const mine = await seed(userId);
    await seed(userId);
    const count = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('x-test-user', userId)
      .expect(200);
    expect(count.body.data).toEqual({ count: 2 });

    for (let i = 0; i < 2; i += 1) {
      const read = await request(app)
        .patch(`/api/v1/notifications/${String(mine._id)}/read`)
        .set('x-test-user', userId)
        .expect(200);
      expect(read.body.data.isRead).toBe(true);
    }

    const all = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('x-test-user', userId)
      .expect(200);
    expect(all.body.data).toEqual({ updatedCount: 1 });
  });

  it("answers 404 for another user's or a missing notification", async () => {
    const theirs = await seed(otherId);
    await request(app)
      .patch(`/api/v1/notifications/${String(theirs._id)}/read`)
      .set('x-test-user', userId)
      .expect(404);
    await request(app)
      .patch(`/api/v1/notifications/${String(newId())}/read`)
      .set('x-test-user', userId)
      .expect(404);
    expect((await Notification.findById(theirs._id).lean())?.isRead).toBe(false);
  });
});
