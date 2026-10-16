import { InsufficientFundsError, type PostLedger } from '../../shared/contracts/ledger.js';
import { WalletTransactionModel } from '../wallet_transactions/wallet_transactions.model.js';
import { WalletModel } from './wallets.model.js';

const bucketField = { AVAILABLE: 'available', HELD: 'held' } as const;

/**
 * Applies the entries of one posting inside the caller's transaction. A debit only matches
 * a wallet whose bucket covers it, so a balance never goes below zero; otherwise the whole
 * transaction is aborted with InsufficientFundsError. `entryKey` = postingKey + index is
 * unique, so replaying a posting fails instead of moving money twice.
 */
export const postLedger: PostLedger = async (session, postingKey, entries) => {
  for (const [index, entry] of entries.entries()) {
    const field = bucketField[entry.bucket];
    const filter =
      entry.amount < 0
        ? { _id: entry.walletId, [field]: { $gte: -entry.amount } }
        : { _id: entry.walletId };

    const wallet = await WalletModel.findOneAndUpdate(
      filter,
      { $inc: { [field]: entry.amount } },
      { new: true, session },
    );
    if (!wallet) {
      throw new InsufficientFundsError();
    }

    await WalletTransactionModel.create(
      [
        {
          walletId: entry.walletId,
          entryKey: `${postingKey}#${index}`,
          postingKey,
          type: entry.type,
          bucket: entry.bucket,
          amount: entry.amount,
          availableAfter: wallet.available,
          heldAfter: wallet.held,
          reference: entry.reference,
          description: entry.description,
        },
      ],
      { session },
    );
  }
};
