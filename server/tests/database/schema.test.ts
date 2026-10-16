import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { allModels } from '../../src/app/models.js';
import { IdentityVerificationModel } from '../../src/features/identity_verifications/identity_verifications.model.js';
import { OrderStatusHistoryModel } from '../../src/features/order_status_history/order_status_history.model.js';
import { RentalOrderModel } from '../../src/features/rental_orders/rental_orders.model.js';
import { UserModel } from '../../src/features/users/users.model.js';
import { ViolationReportModel } from '../../src/features/violation_reports/violation_reports.model.js';
import { WalletTransactionModel } from '../../src/features/wallet_transactions/wallet_transactions.model.js';
import { createToy, day, newId, useTestDatabase } from './helpers.js';

useTestDatabase();

describe('schema', () => {
  it('builds every declared index on an explicitly named snake_case collection', async () => {
    const db = mongoose.connection.db;
    expect(db).toBeDefined();

    for (const model of allModels) {
      const name = model.collection.collectionName;
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(model.schema.get('collection')).toBe(name);

      const built = new Set((await model.collection.indexes()).map((index) => index.name));
      for (const [, options] of model.schema.indexes()) {
        expect(options.name, `${name} index without a name`).toBeTruthy();
        expect(built.has(options.name as string), `${name}.${String(options.name)}`).toBe(true);
      }
    }
  });

  it('rejects free-text enum values and non-integer money', async () => {
    await expect(createToy({ condition: 'used' })).rejects.toThrow(/condition/);
    await expect(createToy({ pricing: { rentPerDay: 1000.5, deposit: 1 } })).rejects.toThrow(
      /whole number of VND/,
    );
    await expect(createToy({ pricing: { rentPerDay: -1, deposit: 1 } })).rejects.toThrow();
  });

  it('requires the prices that match the listing type', async () => {
    await expect(createToy({ pricing: { salePrice: 100_000 } })).rejects.toThrow(/rental post/);
    await expect(createToy({ listingType: 'DONATION', pricing: { salePrice: 1 } })).rejects.toThrow(
      /donation post/,
    );
    const donation = await createToy({ listingType: 'DONATION', pricing: {} });
    expect(donation.status).toBe('ACTIVE');
  });

  it('keeps email and phone unique per account', async () => {
    const base = { passwordHash: 'hash', fullName: 'An Nguyen' };
    await UserModel.create({ ...base, phone: '0900000001', email: 'An@Example.com' });
    await expect(
      UserModel.create({ ...base, phone: '0900000002', email: 'an@example.com' }),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      UserModel.create({ ...base, phone: '0900000001', email: 'other@example.com' }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('allows one pending identity verification per user', async () => {
    const doc = {
      userId: newId(),
      frontImage: { publicId: 'toyflow/identity/f', format: 'jpg' },
      backImage: { publicId: 'toyflow/identity/b', format: 'jpg' },
      selfieImage: { publicId: 'toyflow/identity/s', format: 'png' },
    };
    const first = await IdentityVerificationModel.create(doc);
    await expect(IdentityVerificationModel.create(doc)).rejects.toThrow(/duplicate key/);
    await expect(
      IdentityVerificationModel.updateOne(
        { _id: first._id },
        { status: 'REJECTED' },
        { runValidators: true },
      ),
    ).resolves.toBeDefined();
    await expect(IdentityVerificationModel.create(doc)).resolves.toBeDefined();
  });

  it('allows one open report per reporter and target', async () => {
    const doc = {
      reporterId: newId(),
      target: { kind: 'MESSAGE', id: newId() },
      reason: 'Asks to pay outside the app',
      description: 'Sent a bank account number.',
    };
    await ViolationReportModel.create(doc);
    await expect(ViolationReportModel.create(doc)).rejects.toThrow(/duplicate key/);
  });

  it('rejects self-rental and bad pricing on rental orders', async () => {
    const userId = newId();
    const order = {
      code: 'R-1',
      renterId: userId,
      ownerId: userId,
      toyId: newId(),
      period: { startDate: day(1), endDate: day(3) },
      pricing: { rentPerDay: 10_000, days: 2, rentalFee: 20_000, deposit: 100_000, total: 120_000 },
    };
    await expect(RentalOrderModel.create(order)).rejects.toThrow(/own toy/);
    await expect(
      RentalOrderModel.create({
        ...order,
        ownerId: newId(),
        pricing: { ...order.pricing, total: 1 },
      }),
    ).rejects.toThrow(/total/);
  });

  it('makes the ledger and the status history append-only', async () => {
    const row = await OrderStatusHistoryModel.create({
      orderType: 'RENTAL',
      orderId: newId(),
      toStatus: 'REQUESTED',
      actor: { type: 'USER', userId: newId() },
    });
    await expect(
      OrderStatusHistoryModel.updateOne({ _id: row._id }, { reason: 'edited' }),
    ).rejects.toThrow(/append-only/);
    await expect(OrderStatusHistoryModel.deleteMany({})).rejects.toThrow(/append-only/);
    row.reason = 'edited';
    await expect(row.save()).rejects.toThrow(/append-only/);
    await expect(WalletTransactionModel.deleteOne({})).rejects.toThrow(/append-only/);
  });
});
