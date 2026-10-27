import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Wallet, WalletTransaction } from '../src/models/index.js';
import { withTransaction } from '../src/repositories/transaction.js';
import { WalletLedgerRepository } from '../src/repositories/wallet-ledger.repository.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('WalletLedgerRepository', () => {
  const ledger = new WalletLedgerRepository();
  const userId = new mongoose.Types.ObjectId().toString();
  const ref = { kind: 'admin_credit' as const, id: new mongoose.Types.ObjectId().toString() };

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const sumBalances = async () => {
    const res = await Wallet.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    return res[0]?.total ?? 0;
  };

  it('moves money between wallets and keeps the sum at zero', async () => {
    const user = await ledger.getOrCreateUserWallet(userId);
    const external = await ledger.getOrCreateSystemWallet('external');
    await withTransaction((s) =>
      ledger.post(
        'credit:1',
        ref,
        [
          { walletId: external.id, amount: -500 },
          { walletId: user.id, amount: 500 },
        ],
        s,
      ),
    );
    expect((await Wallet.findById(user.id))!.balance).toBe(500);
    expect((await Wallet.findById(external.id))!.balance).toBe(-500);
    expect(await sumBalances()).toBe(0);
    expect(await WalletTransaction.countDocuments({ postingKey: 'credit:1' })).toBe(2);
  });

  it('rejects unbalanced postings before writing', async () => {
    const a = await ledger.getOrCreateUserWallet(userId);
    await expect(
      withTransaction((s) => ledger.post('bad', ref, [{ walletId: a.id, amount: 10 }], s)),
    ).rejects.toThrow('UNBALANCED_POSTING');
    expect(await WalletTransaction.countDocuments()).toBe(0);
  });

  it('rolls back everything on insufficient balance', async () => {
    const user = await ledger.getOrCreateUserWallet(userId);
    const escrow = await ledger.getOrCreateSystemWallet('escrow');
    const external = await ledger.getOrCreateSystemWallet('external');

    // Credit user 100 first
    await withTransaction((s) =>
      ledger.post(
        'credit:init',
        ref,
        [
          { walletId: external.id, amount: -100 },
          { walletId: user.id, amount: 100 },
        ],
        s,
      ),
    );

    // user has 100; tries to move 150 to escrow
    const err = await withTransaction((s) =>
      ledger.post(
        'pay',
        ref,
        [
          { walletId: user.id, amount: -150 },
          { walletId: escrow.id, amount: 150 },
        ],
        s,
      ),
    ).catch((e) => e);

    expect(err).toMatchObject({
      statusCode: 409,
      code: 'INSUFFICIENT_BALANCE',
      details: { required: 150, balance: 100, shortfall: 50 },
    });
    expect((await Wallet.findById(escrow.id))!.balance).toBe(0);
    expect(await WalletTransaction.countDocuments({ postingKey: 'pay' })).toBe(0);
  });

  it('never double-writes a replayed posting key', async () => {
    const user = await ledger.getOrCreateUserWallet(userId);
    const external = await ledger.getOrCreateSystemWallet('external');
    const entries = [
      { walletId: external.id, amount: -200 },
      { walletId: user.id, amount: 200 },
    ];

    await withTransaction((s) => ledger.post('k', ref, entries, s));
    await expect(withTransaction((s) => ledger.post('k', ref, entries, s))).rejects.toThrow();
    expect(await sumBalances()).toBe(0);
    expect(await WalletTransaction.countDocuments({ postingKey: 'k' })).toBe(2);
  });

  it('creates exactly one system wallet per type under concurrency', async () => {
    await Promise.all([
      ledger.getOrCreateSystemWallet('escrow'),
      ledger.getOrCreateSystemWallet('escrow'),
    ]);
    expect(await Wallet.countDocuments({ ownerType: 'escrow' })).toBe(1);
  });
});
