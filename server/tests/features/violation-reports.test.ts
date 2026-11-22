import express from 'express';
import type { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { errorHandler } from '../../src/middlewares/error-handler.js';
import { AuditLog } from '../../src/models/audit-log.model.js';
import { Conversation } from '../../src/models/conversation.model.js';
import { Message } from '../../src/models/message.model.js';
import { Notification } from '../../src/models/notification.model.js';
import { RefreshToken } from '../../src/models/refresh-token.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import { ViolationReport } from '../../src/models/violation-report.model.js';
import {
  adminViolationReportsRouter,
  violationReportsRouter,
} from '../../src/routes/violation-report.routes.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/violation-reports', violationReportsRouter);
app.use('/api/v1/admin/violation-reports', adminViolationReportsRouter);
app.use(errorHandler);

const ADMIN_ID = newId();
let phoneSeq = 0;

const createUser = async (fullName: string, role: 'USER' | 'ADMIN' = 'USER') => {
  phoneSeq += 1;
  const phone = `+849${String(phoneSeq).padStart(8, '0')}`;
  const user = await User.create({
    phone,
    email: `user${phoneSeq}@toyflow.test`,
    passwordHash: 'x',
    fullName,
    role,
    verificationStatus: 'verified',
  });
  return user._id;
};

const createToy = (ownerId: Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Toy.create({
    ownerId,
    categoryId: newId(),
    title: 'Xe gỗ kéo dây',
    description: 'Xe gỗ cho bé.',
    condition: 'good',
    listingType: 'rent',
    priceOrRate: 20_000,
    depositPrice: 300_000,
    status: 'active',
    ageRange: { minAge: 1, maxAge: 3 },
    images: [{ url: 'https://example.com/1.jpg', publicId: 'toyflow/toys/1' }],
    ...overrides,
  });

const report = (userId: Types.ObjectId, body: object) =>
  request(app)
    .post('/api/v1/violation-reports')
    .set('x-test-user', String(userId))
    .send(body);

const asAdmin = (test: request.Test) =>
  test.set('x-test-user', String(ADMIN_ID)).set('x-test-role', 'ADMIN');
const adminGet = (path: string) => asAdmin(request(app).get(`/api/v1/admin/violation-reports${path}`));
const resolve = (id: string, body: object) =>
  asAdmin(request(app).post(`/api/v1/admin/violation-reports/${id}/resolve`)).send(body);

const description = 'Bánh xe bị nứt, có cạnh sắc.';

let reporter: Types.ObjectId;
let secondReporter: Types.ObjectId;
let owner: Types.ObjectId;
let toyId: string;

beforeEach(async () => {
  await Promise.all([
    User.collection.deleteMany({}),
    Toy.collection.deleteMany({}),
    ViolationReport.collection.deleteMany({}),
    Conversation.collection.deleteMany({}),
    Message.collection.deleteMany({}),
    Notification.collection.deleteMany({}),
    RefreshToken.collection.deleteMany({}),
    AuditLog.collection.deleteMany({}),
  ]);
  await User.create({
    _id: ADMIN_ID,
    phone: '+84900000000',
    email: 'admin@toyflow.test',
    passwordHash: 'x',
    fullName: 'Admin',
    role: 'ADMIN',
  });
  reporter = await createUser('Người báo cáo');
  secondReporter = await createUser('Người báo cáo hai');
  owner = await createUser('Chủ đồ chơi');
  toyId = String((await createToy(owner))._id);
});

describe('UC28 report violation', () => {
  it('saves a toy report as pending, with the owner as the reported user', async () => {
    const response = await report(reporter, {
      targetKind: 'toy',
      targetId: toyId,
      reason: 'unsafe_toy',
      unsafeIssues: ['small_parts', 'broken_or_sharp'],
      description,
      evidence: [{ publicId: `toyflow/reports/${reporter}/abc123`, format: 'jpg' }],
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ targetKind: 'toy', reason: 'unsafe_toy', status: 'pending' });
    const saved = await ViolationReport.findById(response.body.data.id).orFail();
    expect(String(saved.target.userId)).toBe(String(owner));
    expect(saved.isUnsafe).toBe(true);
    expect(saved.evidence).toHaveLength(1);
  });

  it('reports a user and a message of a conversation the reporter belongs to', async () => {
    const userReport = await report(reporter, {
      targetKind: 'user',
      targetId: String(owner),
      reason: 'scam',
      description: 'Yêu cầu chuyển khoản ngoài ToyFlow.',
    });
    expect(userReport.status).toBe(201);

    const conversationId = newId();
    await Conversation.collection.insertOne({
      _id: conversationId,
      participants: [{ userId: reporter }, { userId: owner }],
    });
    const messageId = newId();
    await Message.collection.insertOne({
      _id: messageId,
      conversationId,
      senderId: owner,
      content: 'Chuyển khoản trước cho mình nhé',
      isRead: false,
      createdAt: new Date(),
    });
    const message = { _id: messageId };
    const messageReport = await report(reporter, {
      targetKind: 'message',
      targetId: String(message._id),
      reason: 'contact_outside',
      description: 'Đòi chuyển khoản trực tiếp.',
    });
    expect(messageReport.status).toBe(201);

    // Not a member of the conversation: the message is not found for them.
    const outsider = await report(secondReporter, {
      targetKind: 'message',
      targetId: String(message._id),
      reason: 'spam',
      description: 'Tin nhắn rác quảng cáo.',
    });
    expect(outsider.status).toBe(404);
    // Own message.
    const own = await report(owner, {
      targetKind: 'message',
      targetId: String(message._id),
      reason: 'spam',
      description: 'Tin nhắn rác quảng cáo.',
    });
    expect(own.body.error.code).toBe('CANNOT_REPORT_SELF');
  });

  it('validates the reason rules, the target and the evidence owner', async () => {
    const unsafeUser = await report(reporter, {
      targetKind: 'user',
      targetId: String(owner),
      reason: 'unsafe_toy',
      unsafeIssues: ['battery'],
      description,
    });
    expect(unsafeUser.status).toBe(400);
    const noIssues = await report(reporter, { targetKind: 'toy', targetId: toyId, reason: 'unsafe_toy', description });
    expect(noIssues.status).toBe(400);
    const shortText = await report(reporter, { targetKind: 'toy', targetId: toyId, reason: 'scam', description: 'ngắn' });
    expect(shortText.status).toBe(400);
    const ownToy = await report(owner, { targetKind: 'toy', targetId: toyId, reason: 'scam', description });
    expect(ownToy.body.error.code).toBe('CANNOT_REPORT_SELF');
    const pendingToy = await createToy(owner, { status: 'pending' });
    const notActive = await report(reporter, {
      targetKind: 'toy',
      targetId: String(pendingToy._id),
      reason: 'scam',
      description,
    });
    expect(notActive.body.error.code).toBe('REPORT_TARGET_NOT_FOUND');
    const foreignPhoto = await report(reporter, {
      targetKind: 'toy',
      targetId: toyId,
      reason: 'scam',
      description,
      evidence: [{ publicId: `toyflow/reports/${owner}/abc123`, format: 'jpg' }],
    });
    expect(foreignPhoto.body.error.code).toBe('EVIDENCE_NOT_OWNED');
    const wrongFolder = await report(reporter, {
      targetKind: 'toy',
      targetId: toyId,
      reason: 'scam',
      description,
      evidence: [{ publicId: `toyflow/toys/${reporter}/abc123`, format: 'jpg' }],
    });
    expect(wrongFolder.status).toBe(400);
  });

  it('is for signed-in Users only', async () => {
    expect((await request(app).post('/api/v1/violation-reports').send({})).status).toBe(401);
    const asAdminUser = await asAdmin(request(app).post('/api/v1/violation-reports')).send({});
    expect(asAdminUser.status).toBe(403);
  });

  it('blocks a second report on the same target while the first is pending (GB-37)', async () => {
    const body = { targetKind: 'toy', targetId: toyId, reason: 'scam', description };
    expect((await report(reporter, body)).status).toBe(201);
    const again = await report(reporter, { ...body, reason: 'spam' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REPORT_ALREADY_PENDING');
    // Another reporter may still report it.
    expect((await report(secondReporter, body)).status).toBe(201);
  });

  it('limits a reporter to 10 reports in 24 hours', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await ViolationReport.collection.insertMany(
      Array.from({ length: 10 }, () => ({
        reporterId: reporter,
        target: { kind: 'user', id: newId() },
        reason: 'spam',
        isUnsafe: false,
        description,
        status: 'dismissed',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    const limited = await report(reporter, { targetKind: 'toy', targetId: toyId, reason: 'scam', description });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('REPORT_RATE_LIMITED');

    await ViolationReport.collection.updateMany({}, { $set: { createdAt: old } });
    const later = await report(reporter, { targetKind: 'toy', targetId: toyId, reason: 'scam', description });
    expect(later.status).toBe(201);
  });
});

describe('UC29 Admin report list and detail', () => {
  it('lists pending reports with unsafe ones first, then the oldest first', async () => {
    const other = String((await createToy(owner, { title: 'Búp bê' }))._id);
    const scam = await report(reporter, { targetKind: 'toy', targetId: other, reason: 'scam', description });
    const unsafe = await report(secondReporter, {
      targetKind: 'toy',
      targetId: toyId,
      reason: 'unsafe_toy',
      unsafeIssues: ['battery'],
      description,
    });
    const userReport = await report(secondReporter, {
      targetKind: 'user',
      targetId: String(owner),
      reason: 'harassment',
      description: 'Nhắn tin xúc phạm nhiều lần.',
    });

    const list = await adminGet('');
    expect(list.status).toBe(200);
    expect(list.body.data.map((item: { id: string }) => item.id)).toEqual([
      unsafe.body.data.id,
      scam.body.data.id,
      userReport.body.data.id,
    ]);
    expect(list.body.data[0]).toMatchObject({
      isUnsafe: true,
      target: { kind: 'toy', label: 'Xe gỗ kéo dây' },
      reporter: { fullName: 'Người báo cáo hai' },
      reportedUser: { fullName: 'Chủ đồ chơi' },
    });

    const counts = await adminGet('/counts');
    expect(counts.body.data).toEqual({ pending: 3, resolved: 0, dismissed: 0 });

    const onlyUsers = await adminGet('?targetKind=user');
    expect(onlyUsers.body.pagination.totalItems).toBe(1);

    const detail = await adminGet(`/${unsafe.body.data.id}`);
    expect(detail.body.data).toMatchObject({
      toy: { id: toyId, status: 'active' },
      reportedUser: { id: String(owner), accountStatus: 'ACTIVE', pendingReportCount: 3 },
      otherPendingReports: 0,
    });
    expect(detail.body.data.reporter.maskedPhone).toMatch(/\*\*\*/);
  });

  it('is Admin only', async () => {
    const asUser = await request(app).get('/api/v1/admin/violation-reports').set('x-test-user', String(reporter));
    expect(asUser.status).toBe(403);
    expect((await adminGet(`/${newId()}`)).status).toBe(404);
  });
});

describe('UC29 Admin actions on a report', () => {
  const createToyReports = async () => {
    const first = await report(reporter, { targetKind: 'toy', targetId: toyId, reason: 'scam', description });
    const second = await report(secondReporter, {
      targetKind: 'toy',
      targetId: toyId,
      reason: 'unsafe_toy',
      unsafeIssues: ['small_parts'],
      description,
    });
    return [first.body.data.id as string, second.body.data.id as string];
  };

  it('dismisses a report and closes the other pending reports on the same target', async () => {
    const [first = '', second = ''] = await createToyReports();
    const response = await resolve(first, { action: 'dismiss', note: 'Không thấy vi phạm.' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'dismissed', action: 'dismiss' });
    expect(response.body.data.closedReportIds.sort()).toEqual([first, second].sort());
    const closed = await ViolationReport.findById(second).orFail();
    expect(closed.status).toBe('dismissed');
    expect(String(closed.resolution?.viaReportId)).toBe(first);
    expect((await Toy.findById(toyId).orFail()).status).toBe('active');

    // Both reporters are told; the action is in the audit log.
    expect(await Notification.countDocuments({ type: 'VIOLATION_REPORT_HANDLED' })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'report.dismiss', target_id: closed.resolution?.viaReportId })).toBe(1);

    const again = await resolve(first, { action: 'dismiss', note: 'Không thấy vi phạm.' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REPORT_ALREADY_HANDLED');
  });

  it('removes the reported listing with the reason the Owner sees', async () => {
    const [first] = await createToyReports();
    const response = await resolve(first!, { action: 'remove_listing', note: 'Đồ chơi có chi tiết nhỏ.' });
    expect(response.body.data.status).toBe('resolved');
    const toy = await Toy.findById(toyId).orFail();
    expect(toy.status).toBe('hidden');
    expect(toy.moderation?.rejectReason).toBe('Đồ chơi có chi tiết nhỏ.');
    expect(await Notification.countDocuments({ userId: owner, type: 'LISTING_REMOVED' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'toy.remove' })).toBe(1);
  });

  it('only removes a listing for a toy report', async () => {
    const userReport = await report(reporter, {
      targetKind: 'user',
      targetId: String(owner),
      reason: 'scam',
      description,
    });
    const response = await resolve(userReport.body.data.id, { action: 'remove_listing', note: 'Gỡ tin vi phạm.' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ACTION_NOT_ALLOWED');
    expect((await ViolationReport.findById(userReport.body.data.id).orFail()).status).toBe('pending');
  });

  it('warns the reported user', async () => {
    const [first] = await createToyReports();
    const response = await resolve(first!, { action: 'warn', note: 'Mô tả sai tình trạng đồ chơi.' });
    expect(response.body.data).toMatchObject({ status: 'resolved', action: 'warn' });
    expect(await Notification.countDocuments({ userId: owner, type: 'ACCOUNT_WARNED' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'user.warn', target_id: owner })).toBe(1);
  });

  it('locks the reported user for 7 days: listings hidden, sessions ended, orders untouched', async () => {
    const [first] = await createToyReports();
    await RefreshToken.create({ userId: owner, token: 'owner-token', expiresAt: new Date(Date.now() + 86_400_000) });

    const tooShort = await resolve(first!, { action: 'lock', lockDuration: '7d', note: 'Vi phạm nhiều lần.' });
    expect(tooShort.status).toBe(400);
    const noDuration = await resolve(first!, { action: 'lock', note: 'Vi phạm nhiều lần, đăng đồ chơi nguy hiểm.' });
    expect(noDuration.status).toBe(400);

    const response = await resolve(first!, {
      action: 'lock',
      lockDuration: '7d',
      note: 'Vi phạm nhiều lần, đăng đồ chơi nguy hiểm.',
    });
    expect(response.status).toBe(200);
    const user = await User.findById(owner).orFail();
    expect(user.status).toBe('LOCKED');
    expect(user.lock?.reason).toBe('Vi phạm nhiều lần, đăng đồ chơi nguy hiểm.');
    const days = ((user.lock?.until?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await Toy.findById(toyId).orFail()).status).toBe('hidden');
    expect(await RefreshToken.countDocuments({ userId: owner })).toBe(0);
    expect(await Notification.countDocuments({ userId: owner, type: 'ACCOUNT_LOCKED' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'user.lock' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'report.lock' })).toBe(1);
  });
});
