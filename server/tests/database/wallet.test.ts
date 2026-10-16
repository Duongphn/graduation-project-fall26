import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { withTransaction } from '../../src/infrastructure/database/schema-types.js';
import { PaymentModel } from '../../src/features/payments/payments.model.js';
import { confirmTopUp } from '../../src/features/payments/payments.repository.js';
import { WalletTransactionModel } from '../../src/features/wallet_transactions/wallet_transactions.model.js';
import { WalletModel } from '../../src/features/wallets/wallets.model.js';
import { postLedger } from '../../src/features/wallets/wallets.repository.js';
import { InsufficientFundsError } from '../../src/shared/contracts/ledger.js';
import { day, newId, useTestDatabase } from './helpers.js';

useTestDatabase();

const createWallet = (available = 0) => WalletModel.create({ userId: newId(), available });

describe('wallet top-up callback', () => {
  it('credits the wallet once however often the gateway calls back', async () => {
    const wallet = await createWallet();
    await PaymentModel.create({
      code: 'TOPUP-1',
      userId: wallet.userId,
      walletId: wallet._id,
      amount: 500_000,
      gateway: 'VNPAY',
      expiresAt: day(30),
    });
    const callback = {
      gateway: 'VNPAY' as const,
      code: 'TOPUP-1',
      gatewayTransactionNo: '14000001',
      amount: 500_000,
    };

    const results = await Promise.all([
      confirmTopUp(callback, postLedger),
      confirmTopUp(callback, postLedger),
      confirmTopUp(callback, postLedger),
    ]);
    const again = await confirmTopUp(callback, postLedger);

    expect(results.filter((result) => result.credited)).toHaveLength(1);
    expect(again.credited).toBe(false);
    expect((await WalletModel.findById(wallet._id))?.available).toBe(500_000);
    expect(await WalletTransactionModel.countDocuments({ walletId: wallet._id })).toBe(1);
  });

  it('rejects a second payment with the same gateway transaction number', async () => {
    const base = {
      userId: newId(),
      walletId: newId(),
      amount: 1000,
      gateway: 'MOMO',
      expiresAt: day(30),
    };
    await PaymentModel.create({ ...base, code: 'A', gatewayTransactionNo: 'M-1' });
    await PaymentModel.create({ ...base, code: 'B' });
    await PaymentModel.create({ ...base, code: 'C' });
    await expect(
      PaymentModel.create({ ...base, code: 'D', gatewayTransactionNo: 'M-1' }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('wallet balance', () => {
  it('never lets a debit take a bucket below zero and rolls back the whole posting', async () => {
    const payer = await createWallet(100_000);
    const orderId = newId();

    await expect(
      withTransaction((session) =>
        postLedger(session, `RENTAL_PAYMENT:${orderId.toString()}`, [
          { walletId: payer._id, bucket: 'HELD', amount: 150_000, type: 'ORDER_PAYMENT' },
          { walletId: payer._id, bucket: 'AVAILABLE', amount: -150_000, type: 'ORDER_PAYMENT' },
        ]),
      ),
    ).rejects.toBeInstanceOf(InsufficientFundsError);

    const after = await WalletModel.findById(payer._id);
    expect(after?.available).toBe(100_000);
    expect(after?.held).toBe(0);
    expect(await WalletTransactionModel.countDocuments({ walletId: payer._id })).toBe(0);
  });

  it('moves money into held and records the balances after each entry', async () => {
    const payer = await createWallet(400_000);
    const orderId = newId();

    await withTransaction((session) =>
      postLedger(session, `RENTAL_PAYMENT:${orderId.toString()}`, [
        { walletId: payer._id, bucket: 'AVAILABLE', amount: -340_000, type: 'ORDER_PAYMENT' },
        { walletId: payer._id, bucket: 'HELD', amount: 340_000, type: 'ORDER_PAYMENT' },
      ]),
    );

    const after = await WalletModel.findById(payer._id);
    expect(after?.available).toBe(60_000);
    expect(after?.held).toBe(340_000);
    const rows = await WalletTransactionModel.find({ walletId: payer._id }).sort({ entryKey: 1 });
    expect(rows.map((row) => [row.availableAfter, row.heldAfter])).toEqual([
      [60_000, 0],
      [60_000, 340_000],
    ]);

    await expect(
      withTransaction((session) =>
        postLedger(session, `RENTAL_PAYMENT:${orderId.toString()}`, [
          { walletId: payer._id, bucket: 'AVAILABLE', amount: -1, type: 'ORDER_PAYMENT' },
        ]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects a negative balance written straight to the collection', async () => {
    const wallet = await createWallet(1000);
    await expect(
      mongoose.connection
        .collection('wallets')
        .updateOne({ _id: wallet._id }, { $inc: { available: -5000 } }),
    ).rejects.toThrow(/validation/i);
  });

  it('needs an owner for a user wallet and allows one wallet per user', async () => {
    await expect(WalletModel.create({ ownerType: 'USER' })).rejects.toThrow(/owner/);
    const wallet = await createWallet();
    await expect(WalletModel.create({ userId: wallet.userId })).rejects.toThrow(/duplicate key/);
    await WalletModel.create({ ownerType: 'PLATFORM' });
    await expect(WalletModel.create({ ownerType: 'PLATFORM' })).rejects.toThrow(/duplicate key/);
  });
});
