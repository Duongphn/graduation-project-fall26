import { Types, type Model } from 'mongoose';
import { TRUST_WINDOW_DAYS } from '../constants/trust.js';
import {
  type Clock,
  type RentalNotifier,
  type RentalSettingsProvider,
} from '../interfaces/rental-order.ports.js';
import {
  type RentGate,
  type RentGateMode,
  type TrustRecomputer,
  type TrustSnapshot,
} from '../interfaces/trust.ports.js';
import {
  Dispute,
  type IDispute,
  type IOrderStatusHistory,
  type IReview,
  type IRentalOrder,
  OrderStatusHistory,
  RentalOrder,
  Review,
  type IUser,
  User,
} from '../models/index.js';
import { AppError } from '../utils/app-error.js';
import { notifyAdmins } from './admin-notify.js';
import { computeTrustScore, shouldEnterQueue } from './trust-score.js';

export interface TrustScoreServiceDeps {
  clock: Clock;
  settings: RentalSettingsProvider;
  notifier: RentalNotifier;
  userModel?: Model<IUser>;
  reviewModel?: Model<IReview>;
  historyModel?: Model<IOrderStatusHistory>;
  rentalOrderModel?: Model<IRentalOrder>;
  disputeModel?: Model<IDispute>;
}

const DAY_MS = 86_400_000;

export class TrustScoreService implements TrustRecomputer, RentGate {
  protected readonly clock: Clock;
  protected readonly settings: RentalSettingsProvider;
  protected readonly notifier: RentalNotifier;
  protected readonly userModel: Model<IUser>;
  protected readonly reviewModel: Model<IReview>;
  protected readonly historyModel: Model<IOrderStatusHistory>;
  protected readonly rentalOrderModel: Model<IRentalOrder>;
  protected readonly disputeModel: Model<IDispute>;

  public constructor(deps: TrustScoreServiceDeps) {
    this.clock = deps.clock;
    this.settings = deps.settings;
    this.notifier = deps.notifier;
    this.userModel = deps.userModel ?? User;
    this.reviewModel = deps.reviewModel ?? Review;
    this.historyModel = deps.historyModel ?? OrderStatusHistory;
    this.rentalOrderModel = deps.rentalOrderModel ?? RentalOrder;
    this.disputeModel = deps.disputeModel ?? Dispute;
  }

  public async recompute(userId: string): Promise<TrustSnapshot> {
    const uid = new Types.ObjectId(userId);
    const now = this.clock.now();
    const since = new Date(now.getTime() - TRUST_WINDOW_DAYS * DAY_MS);
    const { minReviewsForTrust } = await this.settings.getRentalSettings();

    const [agg] = await this.reviewModel.aggregate<{ count: number; avg: number }>([
      { $match: { revieweeId: uid, createdAt: { $gte: since } } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$userRating' } } },
    ]);
    const reviewCount = agg?.count ?? 0;
    const rawAverage = agg ? agg.avg : null;

    const cancellations = await this.countFaultCancellations(userId, since);
    const disputesLost = await this.disputeModel.countDocuments({
      status: 'resolved',
      respondentId: uid,
      'resolution.verdict': { $in: ['CLAIMANT_FAVORED', 'PARTIAL'] },
      'resolution.resolvedAt': { $gte: since },
    });

    const snapshot: TrustSnapshot = {
      score: computeTrustScore({
        reviewCount,
        ratingAverage: rawAverage,
        cancellations,
        disputesLost,
        minReviews: minReviewsForTrust,
      }),
      reviewCount,
      ratingAverage: rawAverage === null ? null : Math.round(rawAverage * 100) / 100,
      cancellations,
      disputesLost,
      computedAt: now,
    };

    await this.userModel.updateOne(
      { _id: uid },
      {
        $set: {
          'trust.score': snapshot.score,
          'trust.reviewCount': snapshot.reviewCount,
          'trust.ratingAverage': snapshot.ratingAverage,
          'trust.cancellations': snapshot.cancellations,
          'trust.disputesLost': snapshot.disputesLost,
          'trust.computedAt': snapshot.computedAt,
        },
      },
    );
    return snapshot;
  }

  /**
   * Blocks a renter whose score is below minTrustScore from renting a toy whose deposit exceeds
   * trustDepositCap, unless an Admin override is in force. Only 'create' records the attempt and
   * queues the renter for Admin review; 'quote' just reports.
   */
  public async assertMayRent(
    userId: string,
    toy: { _id: Types.ObjectId; depositPrice?: number | null | undefined },
    mode: RentGateMode,
  ): Promise<void> {
    const { score } = await this.recompute(userId);
    const { minTrustScore, trustDepositCap } = await this.settings.getRentalSettings();
    const depositAmount = toy.depositPrice ?? 0;
    if (score === null || score >= minTrustScore || depositAmount <= trustDepositCap) {
      return;
    }

    const user = await this.userModel.findById(userId).select('fullName trust').lean();
    const now = this.clock.now();
    const allowedUntil = user?.trust?.override?.allowedUntil;
    if (allowedUntil && allowedUntil > now) {
      return;
    }

    const queued =
      mode === 'create' && user
        ? await this.recordBlockedAttempt(user, toy._id, depositAmount, score, now)
        : false;

    const base = 'Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này.';
    throw new AppError(
      403,
      'RENTER_RESTRICTED',
      queued ? `${base} Yêu cầu đã được chuyển cho quản trị viên xem xét.` : base,
      { score, minTrustScore, depositCap: trustDepositCap, queued },
    );
  }

  private async recordBlockedAttempt(
    user: Pick<IUser, 'fullName' | 'trust'> & { _id: Types.ObjectId },
    toyId: Types.ObjectId,
    depositAmount: number,
    score: number,
    now: Date,
  ): Promise<boolean> {
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { 'trust.review.lastBlocked': { attemptAt: now, toyId, depositAmount } } },
    );

    if (!shouldEnterQueue(user.trust, score)) {
      return false;
    }
    // The filter makes concurrent blocked attempts queue (and notify) only once.
    const queued = await this.userModel.updateOne(
      { _id: user._id, 'trust.review.requestedAt': { $exists: false } },
      { $set: { 'trust.review.requestedAt': now } },
    );
    if (queued.modifiedCount === 1) {
      await notifyAdmins(
        this.notifier,
        this.userModel,
        'Có người dùng cần xem xét điểm tin cậy',
        `${user.fullName} bị chặn đặt thuê món cọc ${depositAmount}đ (điểm ${score}).`,
      );
    }
    return queued.modifiedCount === 1;
  }

  public async recomputeQuietly(userIds: string[]): Promise<void> {
    for (const id of userIds) {
      try {
        await this.recompute(id);
      } catch (err) {
        console.error(`Trust recompute failed for user ${id}`, err);
      }
    }
  }

  // The single place to change when UC14 (renter cancellations) is merged.
  public async countFaultCancellations(userId: string, since: Date): Promise<number> {
    const orders = await this.rentalOrderModel
      .find({ renterId: new Types.ObjectId(userId), status: 'EXPIRED' }, { _id: 1 })
      .lean();
    if (orders.length === 0) {
      return 0;
    }
    return this.historyModel.countDocuments({
      orderType: 'RENTAL',
      orderId: { $in: orders.map((o) => o._id) },
      newStatus: 'EXPIRED',
      notes: 'system:PAYMENT',
      occurredAt: { $gte: since },
    });
  }
}
