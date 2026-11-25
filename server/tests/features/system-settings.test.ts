import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { errorHandler } from '../../src/middlewares/error-handler.js';
import { AuditLog } from '../../src/models/audit-log.model.js';
import { SystemSetting } from '../../src/models/system-setting.model.js';
import { User } from '../../src/models/user.model.js';
import {
  adminSettingsRouter,
  publicSettingsRouter,
} from '../../src/routes/system-setting.routes.js';
import { getOpenApiDocument } from '../../src/config/openapi.js';
import { SYSTEM_SETTINGS } from '../../src/constants/system-settings.js';
import { SystemSettingService } from '../../src/services/system-setting.service.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const BASE = '/api/v1/admin/settings';
const ADMIN_ID = newId();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use(BASE, adminSettingsRouter);
app.use('/api/v1/settings', publicSettingsRouter);
app.use(errorHandler);

const asAdmin = (test: request.Test) =>
  test.set('x-test-user', String(ADMIN_ID)).set('x-test-role', 'ADMIN');
const list = () => asAdmin(request(app).get(BASE));
const patch = (key: string, body: object) =>
  asAdmin(request(app).patch(`${BASE}/${key}`)).send(body);
const reset = (key: string, body: object = {}) =>
  asAdmin(request(app).post(`${BASE}/${key}/reset`)).send(body);
const itemOf = async (key: string) =>
  (await list()).body.data.find((item: { key: string }) => item.key === key);
const valueError = (response: request.Response) => ({
  status: response.status,
  code: response.body.error?.code,
  message: response.body.error?.details?.[0]?.message,
  field: response.body.error?.details?.[0]?.field,
});

beforeEach(async () => {
  await Promise.all([
    AuditLog.collection.deleteMany({}),
    SystemSetting.collection.deleteMany({}),
    User.collection.deleteMany({}),
  ]);
  await User.create({
    _id: ADMIN_ID,
    phone: '0900000001',
    email: 'admin@toyflow.test',
    passwordHash: 'x',
    fullName: 'Admin Một',
    role: 'ADMIN',
  });
});

describe('Admin system settings (UC30)', () => {
  it('is Admin only: 401 without sign-in, 403 for a User', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    expect(
      (await request(app).patch(`${BASE}/rental.paymentHours`).send({ value: 6 })).status,
    ).toBe(401);
    const asUser = await request(app).get(BASE).set('x-test-user', String(newId()));
    expect(asUser.status).toBe(403);
    const userPatch = await request(app)
      .patch(`${BASE}/rental.paymentHours`)
      .set('x-test-user', String(newId()))
      .send({ value: 6 });
    expect(userPatch.status).toBe(403);
    expect(await SystemSetting.countDocuments()).toBe(0);
  });

  it('lists every setting in group order with its default when nothing is stored', async () => {
    const response = await list();
    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { key: string }) => item.key)).toEqual(
      SYSTEM_SETTINGS.map((setting) => setting.key),
    );
    expect(response.body.data[0]).toMatchObject({
      key: 'rental.platformFeeRate',
      group: 'RENTAL',
      groupLabel: 'Thuê đồ',
      label: 'Phí nền tảng đơn thuê',
      unit: 'PERCENT',
      unitLabel: '%',
      min: 0,
      max: 50,
      decimals: 2,
      value: 10,
      defaultValue: 10,
      isDefault: true,
      invalidStoredValue: null,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('saves a rate typed in percent, records the Admin and one audit row old → new', async () => {
    const response = await patch('rental.platformFeeRate', {
      value: ' 12,5 ',
      note: '  Tăng phí  ',
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/giao dịch tạo từ bây giờ/);
    expect(response.body.data).toMatchObject({
      value: 12.5,
      isDefault: false,
      updatedBy: { id: String(ADMIN_ID), fullName: 'Admin Một' },
    });
    expect(response.body.data.updatedAt).toEqual(expect.any(String));

    const stored = await SystemSetting.findOne({ key: 'rental.platformFeeRate' }).lean();
    expect(stored).toMatchObject({ value: '0.125', updatedBy: ADMIN_ID });
    expect((await new SystemSettingService().getRentalSettings()).platformFeeRate).toBe(0.125);

    const rows = await AuditLog.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'setting.update',
      target_type: 'SYSTEM_SETTING',
      target_id: stored!._id,
      actor_id: ADMIN_ID,
      details: {
        setting: 'Phí nền tảng đơn thuê',
        key: 'rental.platformFeeRate',
        oldValue: '10%',
        newValue: '12,5%',
        note: 'Tăng phí',
      },
    });

    // A second change logs the previous saved value
    await patch('rental.platformFeeRate', { value: 8 });
    const second = await AuditLog.findOne({}, {}, { sort: { created_at: -1, _id: -1 } }).lean();
    expect(second?.details).toMatchObject({ oldValue: '12,5%', newValue: '8%' });
    expect(second?.details).not.toHaveProperty('note');
  });

  it('refuses invalid values on the value field and changes nothing', async () => {
    const cases: Array<[string, unknown, string]> = [
      ['rental.paymentHours', '', 'Vui lòng nhập giá trị.'],
      ['rental.paymentHours', '   ', 'Vui lòng nhập giá trị.'],
      ['rental.paymentHours', 'abc', 'Giá trị phải là một số.'],
      ['rental.paymentHours', '1,5', 'Giá trị phải là số nguyên.'],
      ['rental.paymentHours', 0, 'Giá trị phải từ 1 giờ đến 168 giờ.'],
      ['rental.paymentHours', 169, 'Giá trị phải từ 1 giờ đến 168 giờ.'],
      ['rental.platformFeeRate', 50.01, 'Giá trị phải từ 0% đến 50%.'],
      ['rental.platformFeeRate', -1, 'Giá trị phải từ 0% đến 50%.'],
      ['rental.platformFeeRate', 1.234, 'Chỉ nhập tối đa 2 chữ số thập phân.'],
      ['rental.minTrustScore', 101, 'Giá trị phải từ 0 điểm đến 100 điểm.'],
      ['DONATION_DECISION_DAYS', 0, 'Giá trị phải từ 1 ngày đến 90 ngày.'],
      ['rental.paymentHours', 12, 'Giá trị mới trùng với giá trị đang áp dụng.'],
    ];
    for (const [key, value, message] of cases) {
      expect(valueError(await patch(key, { value })), `${key} = ${JSON.stringify(value)}`).toEqual({
        status: 400,
        code: 'VALIDATION_ERROR',
        message,
        field: 'value',
      });
    }
    expect(await SystemSetting.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('validates the body shape: missing value, wrong type, long note, unknown field', async () => {
    expect((await patch('rental.paymentHours', {})).status).toBe(400);
    expect((await patch('rental.paymentHours', { value: true })).status).toBe(400);
    expect((await patch('rental.paymentHours', { value: [6] })).status).toBe(400);
    expect((await patch('rental.paymentHours', { value: 6, note: 'x'.repeat(201) })).status).toBe(
      400,
    );
    expect((await patch('rental.paymentHours', { value: 6, extra: 1 })).status).toBe(400);
    expect((await patch('rental.paymentHours', { value: 6, note: 'x'.repeat(200) })).status).toBe(
      200,
    );
  });

  it('answers 404 for a key outside the catalogue', async () => {
    const response = await patch('rental.maxDays', { value: 10 });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SETTING_NOT_FOUND');
    expect((await asAdmin(request(app).get(`${BASE}/categories.seeded`))).status).toBe(404);
    expect((await reset('nope')).status).toBe(404);
  });

  it('keeps the minimum withdrawal at or below the maximum, compared with the value in use', async () => {
    expect(valueError(await patch('withdrawal.minAmount', { value: '20.000.001' }))).toMatchObject({
      status: 400,
      message: 'Số tiền rút tối thiểu không được lớn hơn số tiền rút tối đa (20.000.000 VND).',
    });
    expect((await patch('withdrawal.minAmount', { value: '20.000.000' })).status).toBe(200);
    expect(valueError(await patch('withdrawal.maxAmount', { value: 19_999_999 }))).toMatchObject({
      status: 400,
      message: 'Số tiền rút tối đa không được nhỏ hơn số tiền rút tối thiểu (20.000.000 VND).',
    });
    expect((await patch('withdrawal.maxAmount', { value: '30 000 000' })).status).toBe(200);
    expect(await new SystemSettingService().getWithdrawalLimits()).toEqual({
      minAmount: 20_000_000,
      maxAmount: 30_000_000,
    });
  });

  it('resets to the default with an audit row, and refuses when the default is in use', async () => {
    const already = await reset('rental.paymentHours');
    expect(already.status).toBe(409);
    expect(already.body.error.code).toBe('SETTING_ALREADY_DEFAULT');

    await patch('rental.paymentHours', { value: 6 });
    const response = await reset('rental.paymentHours', { note: 'Quay lại 12 giờ' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ value: 12, isDefault: true });
    expect((await SystemSetting.findOne({ key: 'rental.paymentHours' }).lean())?.value).toBe('12');
    const last = await AuditLog.findOne({ action: 'setting.reset' }).lean();
    expect(last?.details).toMatchObject({
      oldValue: '6 giờ',
      newValue: '12 giờ',
      note: 'Quay lại 12 giờ',
    });
    expect(await AuditLog.countDocuments()).toBe(2);
  });

  it('shows an invalid stored value, uses the default, and lets reset or a save repair it', async () => {
    await SystemSetting.create({ key: 'rental.settlementHours', value: 'abc' });
    expect(await itemOf('rental.settlementHours')).toMatchObject({
      value: 48,
      isDefault: true,
      invalidStoredValue: 'abc',
    });
    const repaired = await reset('rental.settlementHours');
    expect(repaired.status).toBe(200);
    expect(repaired.body.data).toMatchObject({ value: 48, invalidStoredValue: null });
    expect((await AuditLog.findOne().lean())?.details).toMatchObject({
      oldValue: '48 giờ',
      newValue: '48 giờ',
      invalidStored: 'abc',
    });

    await SystemSetting.updateOne({ key: 'rental.settlementHours' }, { value: '-5' });
    expect((await patch('rental.settlementHours', { value: 48 })).status).toBe(200);
  });

  it('gives one setting by key', async () => {
    const response = await asAdmin(request(app).get(`${BASE}/DONATION_CONFIRM_DAYS`));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      key: 'DONATION_CONFIRM_DAYS',
      group: 'DONATION',
      value: 14,
    });
  });

  it('serves the withdrawal limits publicly, without sign-in', async () => {
    await patch('withdrawal.minAmount', { value: 100_000 });
    const response = await request(app).get('/api/v1/settings/public');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      withdrawal: { minAmount: 100_000, maxAmount: 20_000_000 },
    });
  });

  it('is documented in the OpenAPI document', () => {
    const paths = getOpenApiDocument().paths as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths[BASE] ?? {})).toEqual(['get']);
    expect(Object.keys(paths[`${BASE}/{key}`] ?? {}).sort()).toEqual(['get', 'patch']);
    expect(paths[`${BASE}/{key}/reset`]?.post).toBeDefined();
    expect(paths['/api/v1/settings/public']?.get).toBeDefined();
  });
});
