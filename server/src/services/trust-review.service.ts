import { Types, type Model } from 'mongoose';
import { TRUST_WINDOW_DAYS } from '../constants/trust.js';
import {
  type Clock,
  type RentalNotifier,
  type RentalSettingsProvider,
} from '../interfaces/rental-order.ports.js';
import { type TrustRecomputer } from '../interfaces/trust.ports.js';
import {
  Dispute,
  type IDispute,
  type IOrderStatusHistory,
  type IRentalOrder,
  type IReview,
  type IToy,
  type IUser,
  OrderStatusHistory,
  RentalOrder,
  Review,
  Toy,
  type TrustDecision,
  User,
} from '../models/index.js';
import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import { withTransaction } from '../repositories/transaction.js';
import { type AdminContext } from '../utils/admin-context.js';
import { AppError } from '../utils/app-error.js';
import { maskPhone } from '../utils/phone.js';
import {
  type TrustDecisionInput,
  type TrustQueueQuery,
} from '../validations/trust-review.validation.js';
import { type Paginated, type ReviewDto, toReviewDto } from './review.mapper.js';
import { vnToday } from './rental-time.js';

export interface TrustQueueItemDto {
  userId: string;
  fullName: string;
  phone: string;
  score: number | null;
  reviewCount: number;
  ratingAverage: number | null;
  cancellations: number;
  disputesLost: number;
  requestedAt: string | null;
  lastBlocked: {
    attemptAt: string;
    toyId: string;
    toyTitle: string | null;
    depositAmount: number;
  } | null;
}

/**
 * The item fields plus the evidence. `disputesLost` here is the list of lost disputes (as the
 * spec asks); the numeric count of the item is `disputesLostCount`.
 */
export interface TrustReviewDetailDto extends Omit<TrustQueueItemDto, 'disputesLost'> {
  disputesLostCount: number;
  override: { allowedUntil: string; decidedBy: string; decidedAt: string } | null;
  lastDecision: {
    decision: TrustDecision;
    reason: string;
    scoreAtDecision: number | null;
    decidedBy: string;
    decidedAt: string;
  } | null;
  reviews: ReviewDto[];
  expiredOrders: { orderId: string; code: string; expiredAt: string }[];
  disputesLost: { disputeId: string; code: string; verdict: string; resolvedAt: string }[];
}

export interface TrustReviewServiceDeps {
  clock: Clock;
  settings: RentalSettingsProvider;
  notifier: RentalNotifier;
  trust: TrustRecomputer;
  userModel?: Model<IUser>;
  toyModel?: Model<IToy>;
  reviewModel?: Model<IReview>;
  historyModel?: Model<IOrderStatusHistory>;
  rentalOrderModel?: Model<IRentalOrder>;
  disputeModel?: Model<IDispute>;
}

const DAY_MS = 86_400_000;
const EVIDENCE_LIMIT = 20;

/** dd/MM/yyyy of the Vietnam calendar day (UTC+7). */
const formatDate = (d: Date): string => {
  const vn = vnToday(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
};

type UserDoc = Pick<IUser, 'fullName' | 'phone' | 'trust'> & { _id: Types.ObjectId };

export class TrustReviewService {
  private readonly clock: Clock;
  private readonly settings: RentalSettingsProvider;
  private readonly notifier: RentalNotifier;
  private readonly trust: TrustRecomputer;
  private readonly userModel: Model<IUser>;
  private readonly toyModel: Model<IToy>;
  private readonly reviewModel: Model<IReview>;
  private readonly historyModel: Model<IOrderStatusHistory>;
  private readonly rentalOrderModel: Model<IRentalOrder>;
  private readonly disputeModel: Model<IDispute>;

  public constructor(deps: TrustReviewServiceDeps) {
    this.clock = deps.clock;
    this.settings = deps.settings;
    this.notifier = deps.notifier;
    this.trust = deps.trust;
    this.userModel = deps.userModel ?? User;
    this.toyModel = deps.toyModel ?? Toy;
    this.reviewModel = deps.reviewModel ?? Review;
    this.historyModel = deps.historyModel ?? OrderStatusHistory;
    this.rentalOrderModel = deps.rentalOrderModel ?? RentalOrder;
    this.disputeModel = deps.disputeModel ?? Dispute;
  }

  public async list(query: TrustQueueQuery): Promise<Paginated<TrustQueueItemDto>> {
    const filter = { 'trust.review.requestedAt': { $exists: true } };
    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ 'trust.review.requestedAt': 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .select('fullName phone trust')
        .lean(),
      this.userModel.countDocuments(filter),
    ]);
    const toyIds = users
      .map((u) => u.trust?.review?.lastBlocked?.toyId)
      .filter((id): id is Types.ObjectId => !!id);
    const titles = await this.toyTitles(toyIds);
    return {
      items: users.map((u) => this.toItem(u, titles)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  public async detail(userId: string): Promise<TrustReviewDetailDto> {
    const uid = this.parseUserId(userId);
    if (!(await this.userModel.exists({ _id: uid }))) throw this.notFound();
    await this.trust.recompute(userId);
    const user = await this.userModel.findById(uid).select('fullName phone trust').lean();
    if (!user) throw this.notFound();

    const since = new Date(this.clock.now().getTime() - TRUST_WINDOW_DAYS * DAY_MS);
    const reviews = await this.reviewModel
      .find({ revieweeId: uid, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(EVIDENCE_LIMIT)
      .lean();
    const reviewers = await this.userModel
      .find({ _id: { $in: reviews.map((r) => r.reviewerId) } })
      .select('fullName avatar')
      .lean();
    const reviewerById = new Map(reviewers.map((r) => [r._id.toString(), r]));

    const renterOrders = await this.rentalOrderModel
      .find({ renterId: uid, status: 'EXPIRED' })
      .select('code')
      .lean();
    const codeByOrder = new Map(renterOrders.map((o) => [o._id.toString(), o.code]));
    const expiredRows = renterOrders.length
      ? await this.historyModel
          .find({
            orderId: { $in: renterOrders.map((o) => o._id) },
            orderType: 'RENTAL',
            newStatus: 'EXPIRED',
            notes: 'system:PAYMENT',
            occurredAt: { $gte: since },
          })
          .sort({ occurredAt: -1 })
          .limit(EVIDENCE_LIMIT)
          .select('orderId occurredAt')
          .lean()
      : [];

    const disputes = await this.disputeModel
      .find({
        status: 'resolved',
        respondentId: uid,
        'resolution.verdict': { $in: ['CLAIMANT_FAVORED', 'PARTIAL'] },
        'resolution.resolvedAt': { $gte: since },
      })
      .sort({ 'resolution.resolvedAt': -1 })
      .limit(EVIDENCE_LIMIT)
      .lean();

    const blockedToy = user.trust?.review?.lastBlocked?.toyId;
    const titles = await this.toyTitles(blockedToy ? [blockedToy] : []);
    const { disputesLost, ...item } = this.toItem(user, titles);
    const t = user.trust;
    return {
      ...item,
      disputesLostCount: disputesLost,
      override: t?.override?.allowedUntil
        ? {
            allowedUntil: t.override.allowedUntil.toISOString(),
            decidedBy: t.override.decidedBy?.toString() ?? '',
            decidedAt: t.override.decidedAt?.toISOString() ?? '',
          }
        : null,
      lastDecision: t?.lastDecision
        ? {
            decision: t.lastDecision.decision,
            reason: t.lastDecision.reason,
            scoreAtDecision: t.lastDecision.scoreAtDecision ?? null,
            decidedBy: t.lastDecision.decidedBy.toString(),
            decidedAt: t.lastDecision.decidedAt.toISOString(),
          }
        : null,
      reviews: reviews.map((r) => {
        const reviewer = reviewerById.get(r.reviewerId.toString());
        return toReviewDto(r, {
          id: r.reviewerId.toString(),
          fullName: reviewer?.fullName ?? '',
          ...(reviewer?.avatar ? { avatar: reviewer.avatar } : {}),
        });
      }),
      expiredOrders: expiredRows.map((r) => ({
        orderId: r.orderId.toString(),
        code: codeByOrder.get(r.orderId.toString()) ?? '',
        expiredAt: r.occurredAt.toISOString(),
      })),
      disputesLost: disputes.map((d) => ({
        disputeId: d._id.toString(),
        code: d.code,
        verdict: d.resolution!.verdict,
        resolvedAt: d.resolution!.resolvedAt.toISOString(),
      })),
    };
  }

  public async decide(
    context: AdminContext,
    userId: string,
    input: TrustDecisionInput,
  ): Promise<TrustReviewDetailDto> {
    const uid = this.parseUserId(userId);
    const user = await this.userModel.findById(uid).select('trust').lean();
    if (!user) throw this.notFound();

    const { trustOverrideDays } = await this.settings.getRentalSettings();
    const now = this.clock.now();
    const decidedBy = new Types.ObjectId(context.actor.actorId);
    const allowedUntil = new Date(now.getTime() + trustOverrideDays * DAY_MS);

    await withTransaction(async (session) => {
      // $unset, never null: the queue-entry write in TrustScoreService filters on $exists:false.
      const res = await this.userModel.updateOne(
        { _id: uid, 'trust.review.requestedAt': { $exists: true } },
        {
          $unset: { 'trust.review.requestedAt': '' },
          $set: {
            'trust.lastDecision': {
              decision: input.decision,
              reason: input.reason,
              scoreAtDecision: user.trust?.score ?? null,
              decidedBy,
              decidedAt: now,
            },
            ...(input.decision === 'ALLOW'
              ? { 'trust.override': { allowedUntil, decidedBy, decidedAt: now } }
              : {}),
          },
        },
        { session },
      );
      if (res.matchedCount === 0) {
        throw new AppError(
          409,
          'TRUST_REVIEW_NOT_PENDING',
          'Người dùng này không còn trong danh sách chờ xem xét.',
        );
      }
      await writeAuditLog(
        adminAuditEntry(
          context,
          input.decision === 'ALLOW' ? 'trust.allow' : 'trust.keep_restricted',
          { kind: 'USER', id: userId },
        ),
        session,
      );
    });

    try {
      await this.notifier.notify(
        input.decision === 'ALLOW'
          ? {
              userId,
              title: 'Bạn đã được cho phép đặt thuê',
              body: `Quản trị viên cho phép bạn đặt thuê đến ${formatDate(allowedUntil)}. Lý do: ${input.reason}`,
            }
          : {
              userId,
              title: 'Hạn chế đặt thuê được giữ nguyên',
              body: `Lý do: ${input.reason}`,
            },
      );
    } catch {
      // The decision is committed; a failed notification must not fail the request.
    }

    // The decision is already committed: never let building the response turn it into an error.
    try {
      return await this.detail(userId);
    } catch {
      return this.fallbackDetail(userId);
    }
  }

  /** Response built without recompute or evidence queries, from the stored user only. */
  private async fallbackDetail(userId: string): Promise<TrustReviewDetailDto> {
    const uid = new Types.ObjectId(userId);
    const user = await this.userModel.findById(uid).select('fullName phone trust').lean();
    if (!user) throw this.notFound();
    const { disputesLost, ...item } = this.toItem(user, new Map());
    const t = user.trust;
    return {
      ...item,
      disputesLostCount: disputesLost,
      override: t?.override?.allowedUntil
        ? {
            allowedUntil: t.override.allowedUntil.toISOString(),
            decidedBy: t.override.decidedBy?.toString() ?? '',
            decidedAt: t.override.decidedAt?.toISOString() ?? '',
          }
        : null,
      lastDecision: t?.lastDecision
        ? {
            decision: t.lastDecision.decision,
            reason: t.lastDecision.reason,
            scoreAtDecision: t.lastDecision.scoreAtDecision ?? null,
            decidedBy: t.lastDecision.decidedBy.toString(),
            decidedAt: t.lastDecision.decidedAt.toISOString(),
          }
        : null,
      reviews: [],
      expiredOrders: [],
      disputesLost: [],
    };
  }

  private parseUserId(userId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(userId)) throw this.notFound();
    return new Types.ObjectId(userId);
  }

  private notFound(): AppError {
    return new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng.');
  }

  private async toyTitles(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const toys = await this.toyModel.find({ _id: { $in: ids } }).select('title').lean();
    return new Map(toys.map((t) => [t._id.toString(), t.title]));
  }

  private toItem(user: UserDoc, titles: Map<string, string>): TrustQueueItemDto {
    const t = user.trust;
    const blocked = t?.review?.lastBlocked;
    return {
      userId: user._id.toString(),
      fullName: user.fullName,
      phone: maskPhone(user.phone),
      score: t?.score ?? null,
      reviewCount: t?.reviewCount ?? 0,
      ratingAverage: t?.ratingAverage ?? null,
      cancellations: t?.cancellations ?? 0,
      disputesLost: t?.disputesLost ?? 0,
      requestedAt: t?.review?.requestedAt?.toISOString() ?? null,
      lastBlocked: blocked
        ? {
            attemptAt: blocked.attemptAt.toISOString(),
            toyId: blocked.toyId.toString(),
            toyTitle: titles.get(blocked.toyId.toString()) ?? null,
            depositAmount: blocked.depositAmount,
          }
        : null,
    };
  }
}
