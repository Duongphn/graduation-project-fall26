import { Types } from 'mongoose';
import { ESCROW_HELD_RENTAL_STATUSES } from '../constants/wallet-transaction.js';
import { type WalletHoldings, type WalletHoldingsPort } from '../interfaces/wallet.ports.js';
import { RentalOrder } from '../models/index.js';

const sumOf = (rows: Array<{ total?: number }>) => rows[0]?.total ?? 0;

/** "Đang tạm giữ" of a user: money that left their balance but is still theirs. */
export class WalletHoldingsRepository implements WalletHoldingsPort {
  public async getHoldings(userId: string): Promise<WalletHoldings> {
    const rentals = await RentalOrder.aggregate<{ total?: number }>([
      {
        $match: {
          renterId: new Types.ObjectId(userId),
          status: { $in: [...ESCROW_HELD_RENTAL_STATUSES] },
        },
      },
      { $group: { _id: null, total: { $sum: '$pricing.totalPayable' } } },
    ]);

    return { rentals: sumOf(rentals) };
  }
}
