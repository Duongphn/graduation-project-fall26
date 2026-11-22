import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { errorHandler } from '../../src/middlewares/error-handler.js';
import { AuditLog } from '../../src/models/audit-log.model.js';
import { User } from '../../src/models/user.model.js';
import {
  buildAuditLog,
  shortDetails,
  writeAuditLog,
} from '../../src/repositories/audit-log.repository.js';
import { adminAuditLogsRouter } from '../../src/routes/audit-log.routes.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const BASE = '/api/v1/admin/audit-logs';
const ADMIN_ID = newId();
const OTHER_ADMIN_ID = newId();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use(BASE, adminAuditLogsRouter);
app.use(errorHandler);

const asAdmin = (test: request.Test) =>
  test.set('x-test-user', String(ADMIN_ID)).set('x-test-role', 'ADMIN');
const get = (query = '') => asAdmin(request(app).get(`${BASE}${query}`));

const createAdmin = (id: typeof ADMIN_ID, fullName: string, phone: string) =>
  User.create({
    _id: id,
    phone,
    email: `${phone}@toyflow.test`,
    passwordHash: 'x',
    fullName,
    role: 'ADMIN',
  });

/** Inserts one entry with a chosen time (the model sets created_at itself). */
const insertAt = (createdAt: Date, entry: Parameters<typeof buildAuditLog>[0]) =>
  AuditLog.collection.insertOne({ ...buildAuditLog(entry), created_at: createdAt });

beforeEach(async () => {
  await Promise.all([AuditLog.collection.deleteMany({}), User.collection.deleteMany({})]);
  await createAdmin(ADMIN_ID, 'Admin Một', '0900000001');
  await createAdmin(OTHER_ADMIN_ID, 'Admin Hai', '0900000002');
  const toyId = String(newId());
  await insertAt(new Date('2026-11-01T01:00:00Z'), {
    actorId: String(ADMIN_ID),
    action: 'toy.approve',
    target: { kind: 'TOY', id: toyId },
  });
  await insertAt(new Date('2026-11-02T01:00:00Z'), {
    actorId: String(OTHER_ADMIN_ID),
    action: 'toy.reject',
    target: { kind: 'TOY', id: toyId },
    details: { reason: 'Ảnh không rõ' },
  });
  await insertAt(new Date('2026-11-03T01:00:00Z'), {
    actorId: String(ADMIN_ID),
    action: 'user.lock',
    target: { kind: 'USER', id: String(newId()) },
    details: { duration: '7d' },
    ipAddress: '10.0.0.1',
  });
  await insertAt(new Date('2026-11-04T01:00:00Z'), {
    action: 'user.unlock',
    target: { kind: 'USER', id: String(newId()) },
    details: { duration: 'expired' },
  });
});

describe('Admin audit log (UC31)', () => {
  it('is Admin only', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    const asUser = await request(app).get(BASE).set('x-test-user', String(newId()));
    expect(asUser.status).toBe(403);
  });

  it('lists entries newest first with actor names, details and paging', async () => {
    const response = await get('?limit=2');
    expect(response.status).toBe(200);
    expect(response.body.pagination).toMatchObject({ totalItems: 4, totalPages: 2, limit: 2 });
    const [first, second] = response.body.data;
    expect(first).toMatchObject({ action: 'user.unlock', actor: null, targetType: 'USER' });
    expect(second).toMatchObject({
      action: 'user.lock',
      actor: { id: String(ADMIN_ID), fullName: 'Admin Một' },
      details: { duration: '7d' },
      ipAddress: '10.0.0.1',
      createdAt: '2026-11-03T01:00:00.000Z',
    });
  });

  it('filters by actor, exact action, action area and time range', async () => {
    const byActor = await get(`?actorId=${OTHER_ADMIN_ID}`);
    expect(byActor.body.data.map((row: { action: string }) => row.action)).toEqual(['toy.reject']);

    const exact = await get('?action=toy.approve');
    expect(exact.body.pagination.totalItems).toBe(1);

    const area = await get('?action=toy');
    expect(area.body.data.map((row: { action: string }) => row.action)).toEqual([
      'toy.reject',
      'toy.approve',
    ]);

    const range = await get(
      `?from=${encodeURIComponent('2026-11-02T00:00:00Z')}&to=${encodeURIComponent('2026-11-03T12:00:00Z')}`,
    );
    expect(range.body.data.map((row: { action: string }) => row.action)).toEqual([
      'user.lock',
      'toy.reject',
    ]);

    const oldestFirst = await get('?sortOrder=asc&limit=1');
    expect(oldestFirst.body.data[0].action).toBe('toy.approve');
  });

  it('rejects an invalid filter (bad action, from after to, unknown key)', async () => {
    expect((await get('?action=DROP TABLE')).status).toBe(400);
    expect(
      (await get('?from=2026-11-05T00:00:00Z&to=2026-11-01T00:00:00Z')).status,
    ).toBe(400);
    expect((await get('?foo=1')).status).toBe(400);
    expect((await get('?sortBy=action')).status).toBe(400);
  });

  it('returns the filter values: actions written so far and the Admin accounts', async () => {
    const response = await get('/filters');
    expect(response.status).toBe(200);
    expect(response.body.data.actions).toEqual([
      'toy.approve',
      'toy.reject',
      'user.lock',
      'user.unlock',
    ]);
    expect(response.body.data.actors).toEqual([
      { id: String(OTHER_ADMIN_ID), fullName: 'Admin Hai' },
      { id: String(ADMIN_ID), fullName: 'Admin Một' },
    ]);
  });

  it('has no route that changes or deletes an entry', async () => {
    const [entry] = (await get()).body.data;
    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await asAdmin(request(app)[method](`${BASE}/${entry.id}`)).send({});
      expect(response.status).toBe(404);
    }
  });
});

describe('audit writer', () => {
  it('stores a short summary and refuses any update or delete (append-only)', async () => {
    await writeAuditLog({
      actorId: String(ADMIN_ID),
      action: 'category.delete',
      target: { kind: 'CATEGORY', id: String(newId()) },
      details: { name: 'Đồ chơi gỗ' },
    });
    const saved = await AuditLog.findOne({ action: 'category.delete' }).orFail();
    expect(saved.details).toEqual({ name: 'Đồ chơi gỗ' });

    await expect(
      AuditLog.updateOne({ _id: saved._id }, { $set: { action: 'category.create' } }),
    ).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteOne({ _id: saved._id })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    saved.action = 'category.create';
    await expect(saved.save()).rejects.toThrow(/append-only/);
    expect(await AuditLog.countDocuments({ action: 'category.delete' })).toBe(1);
  });

  it('keeps details short: at most 10 values, long texts cut', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(shortDetails(many) ?? {})).toHaveLength(10);
    const long = shortDetails({ reason: 'x'.repeat(400) });
    expect(String(long?.reason)).toHaveLength(300);
    expect(shortDetails({})).toBeUndefined();
  });
});
