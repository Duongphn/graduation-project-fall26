import { Types } from 'mongoose';
import { ESCROW_HELD_RENTAL_STATUSES } from '../constants/wallet-transaction.js';
import { type WalletHoldings, type WalletHoldingsPort } from '../interfaces/wallet.ports.js';
import { RentalOrder } from '../models/index.js';
import { WithdrawalRepository } from './withdrawal.repository.js';

const sumOf = (rows: Array<{ total?: number }>) => rows[0]?.total ?? 0;

/** "Đang tạm giữ" of a user: money that left their balance but is still theirs. */
export class WalletHoldingsRepository implements WalletHoldingsPort {
  public constructor(private readonly withdrawals = new WithdrawalRepository()) {}

  public async getHoldings(userId: string): Promise<WalletHoldings> {
    const rentalsQuery = RentalOrder.aggregate<{ total?: number }>([
      {
        $match: {
          renterId: new Types.ObjectId(userId),
          status: { $in: [...ESCROW_HELD_RENTAL_STATUSES] },
        },
      },
      { $group: { _id: null, total: { $sum: '$pricing.totalPayable' } } },
    ]);
    const [rentals, withdrawals] = await Promise.all([rentalsQuery.exec(), this.withdrawals.sumHeld(userId)]);

    return { rentals: sumOf(rentals), withdrawals };
  }
}
