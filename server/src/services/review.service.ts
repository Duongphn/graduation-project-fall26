import mongoose, { type Model } from 'mongoose';
import type {
  Clock,
  RentalNotifier,
  RentalSettingsProvider,
} from '../interfaces/rental-order.ports.js';
import type { TrustRecomputer } from '../interfaces/trust.ports.js';
import { RentalOrder, type IRentalOrder } from '../models/rental-order.model.js';
import { Review, type IReview, type ReviewDirection } from '../models/review.model.js';
import { Toy, type IToy } from '../models/toy.model.js';
import { User, type IUser } from '../models/user.model.js';
import { withTransaction } from '../repositories/transaction.js';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import { hasBlockedContactDetails } from '../utils/contact-details.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';
import { validateSubmitReviewInput, type ReviewListQuery } from '../validations/review.validation.js';
import {
  type OrderReviewsDto,
  type Paginated,
  type ReviewDto,
  type ReviewerDto,
  toReviewDto,
} from './review.mapper.js';

export interface ReviewServiceDeps {
  clock: Clock;
  settings: RentalSettingsProvider;
  notifier: RentalNotifier;
  trust: TrustRecomputer;
  reviewModel?: Model<IReview>;
  rentalOrderModel?: Model<IRentalOrder>;
  toyModel?: Model<IToy>;
  userModel?: Model<IUser>;
}

const DAY_MS = 86_400_000;

export class ReviewService {
  private readonly clock: Clock;
  private readonly settings: RentalSettingsProvider;
  private readonly notifier: RentalNotifier;
  private readonly trust: TrustRecomputer;
  private readonly reviewModel: Model<IReview>;
  private readonly rentalOrderModel: Model<IRentalOrder>;
  private readonly toyModel: Model<IToy>;
  private readonly userModel: Model<IUser>;

  public constructor(deps: ReviewServiceDeps) {
    this.clock = deps.clock;
    this.settings = deps.settings;
    this.notifier = deps.notifier;
    this.trust = deps.trust;
    this.reviewModel = deps.reviewModel ?? Review;
    this.rentalOrderModel = deps.rentalOrderModel ?? RentalOrder;
    this.toyModel = deps.toyModel ?? Toy;
    this.userModel = deps.userModel ?? User;
  }

  /** The body is validated here, after the caller is known to be a party of the order. */
  public async submitRentalReview(
    actor: RequestActor,
    orderId: string,
    body: unknown,
  ): Promise<ReviewDto> {
    const order = await this.loadForParty(actor, orderId);
    const isRenter = order.renterId.toString() === actor.userId;

    if (order.status !== 'COMPLETED') {
      throw new AppError(409, 'ORDER_NOT_COMPLETED', 'Chỉ có thể đánh giá đơn đã hoàn tất.');
    }
    const deadline = await this.deadlineOf(order);
    if (!deadline || this.clock.now().getTime() > deadline.getTime()) {
      throw new AppError(409, 'REVIEW_WINDOW_CLOSED', 'Đã quá thời hạn đánh giá đơn thuê này.');
    }

    const input = validateSubmitReviewInput(body);
    if (isRenter && input.toyRating === undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Vui lòng đánh giá đồ chơi.');
    }
    if (!isRenter && input.toyRating !== undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Chủ đồ chơi không đánh giá đồ chơi.');
    }

    if (input.comment && hasBlockedContactDetails(input.comment)) {
      throw new AppError(
        400,
        'CONTACT_DETAILS_NOT_ALLOWED',
        'Nhận xét không được chứa số điện thoại, email hoặc liên kết.',
      );
    }

    const reviewer = await this.reviewerOf(actor.userId);
    const direction: ReviewDirection = isRenter ? 'RENTER_TO_OWNER' : 'OWNER_TO_RENTER';
    const revieweeId = isRenter ? order.ownerId : order.renterId;

    let created: IReview;
    try {
      created = await withTransaction(async (session) => {
        const [review] = await this.reviewModel.create(
          [
            {
              orderType: 'rental_order',
              orderId: order._id,
              direction,
              reviewerId: new mongoose.Types.ObjectId(actor.userId),
              revieweeId,
              toyId: order.toyId,
              userRating: input.userRating,
              ...(input.toyRating !== undefined ? { toyRating: input.toyRating } : {}),
              ...(input.comment ? { comment: input.comment } : {}),
            },
          ],
          { session },
        );
        if (input.toyRating !== undefined) {
          await this.toyModel.updateOne(
            { _id: order.toyId },
            { $inc: { 'rating.sum': input.toyRating, 'rating.count': 1 } },
            { session },
          );
        }
        return review as IReview;
      });
    } catch (err) {
      if (isDuplicateKeyError(err, 'review_once_per_order')) {
        throw new AppError(409, 'ALREADY_REVIEWED', 'Bạn đã đánh giá đơn thuê này rồi.');
      }
      throw err;
    }

    await this.trust.recomputeQuietly([revieweeId.toString()]);
    try {
      await this.notifier.notify({
        userId: revieweeId.toString(),
        title: 'Bạn có đánh giá mới',
        body: `Đơn thuê ${order.code} vừa được đánh giá ${input.userRating}★.`,
      });
    } catch {
      // A failed notification never undoes a saved review.
    }

    return toReviewDto(created, reviewer);
  }

  public async getRentalReviews(actor: RequestActor, orderId: string): Promise<OrderReviewsDto> {
    const order = await this.loadForParty(actor, orderId);
    const reviews = await this.reviewModel.find({ orderType: 'rental_order', orderId: order._id });
    const mine = reviews.find((r) => r.reviewerId.toString() === actor.userId) ?? null;
    const theirs = reviews.find((r) => r.reviewerId.toString() !== actor.userId) ?? null;

    const completed = order.status === 'COMPLETED';
    const deadline = completed ? await this.deadlineOf(order) : null;
    const canReview =
      completed && deadline !== null && this.clock.now().getTime() <= deadline.getTime() && !mine;

    const toDto = async (r: IReview | null): Promise<ReviewDto | null> =>
      r ? toReviewDto(r, await this.reviewerOf(r.reviewerId.toString())) : null;

    return {
      myReview: await toDto(mine),
      theirReview: await toDto(theirs),
      canReview,
      reviewDeadline: deadline ? deadline.toISOString() : null,
    };
  }

  /** Reviews of a toy written by its renters, newest first. Only an active toy has public reviews. */
  public async listToyReviews(toyId: string, query: ReviewListQuery): Promise<Paginated<ReviewDto>> {
    const toy = mongoose.Types.ObjectId.isValid(toyId)
      ? await this.toyModel.findOne({ _id: toyId, status: 'active' }).select('_id')
      : null;
    if (!toy) throw new AppError(404, 'TOY_NOT_FOUND', 'Không tìm thấy đồ chơi.');
    return this.listPage({ toyId: toy._id, direction: 'RENTER_TO_OWNER' }, query);
  }

  /** Reviews received by a user; `role` picks those received as owner or as renter. */
  public async listUserReviews(userId: string, query: ReviewListQuery): Promise<Paginated<ReviewDto>> {
    const user = mongoose.Types.ObjectId.isValid(userId)
      ? await this.userModel.findById(userId).select('_id')
      : null;
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng.');
    const direction: ReviewDirection | undefined =
      query.role === 'owner' ? 'RENTER_TO_OWNER' : query.role === 'renter' ? 'OWNER_TO_RENTER' : undefined;
    return this.listPage({ revieweeId: user._id, ...(direction ? { direction } : {}) }, query);
  }

  private async listPage(
    filter: Record<string, unknown>,
    query: ReviewListQuery,
  ): Promise<Paginated<ReviewDto>> {
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.reviewModel.countDocuments(filter),
    ]);
    const reviewerIds = [...new Set(reviews.map((r) => r.reviewerId.toString()))];
    const users = await this.userModel.find({ _id: { $in: reviewerIds } }).select('fullName avatar');
    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    const items = reviews.map((r) => {
      const id = r.reviewerId.toString();
      const u = byId.get(id);
      return toReviewDto(r, {
        id,
        fullName: u?.fullName ?? '',
        ...(u?.avatar ? { avatar: u.avatar } : {}),
      });
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  private async deadlineOf(order: IRentalOrder): Promise<Date | null> {
    const settledAt = order.settlement?.settledAt;
    if (!settledAt) return null;
    const { reviewWindowDays } = await this.settings.getRentalSettings();
    return new Date(settledAt.getTime() + reviewWindowDays * DAY_MS);
  }

  private async reviewerOf(userId: string): Promise<ReviewerDto> {
    const user = await this.userModel.findById(userId).select('fullName avatar');
    return {
      id: userId,
      fullName: user?.fullName ?? '',
      ...(user?.avatar ? { avatar: user.avatar } : {}),
    };
  }

  private async loadForParty(actor: RequestActor, orderId: string): Promise<IRentalOrder> {
    const notFound = () => new AppError(404, 'RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
    if (!mongoose.Types.ObjectId.isValid(orderId)) throw notFound();
    const order = await this.rentalOrderModel.findById(orderId);
    if (!order) throw notFound();
    if (order.renterId.toString() !== actor.userId && order.ownerId.toString() !== actor.userId) {
      throw notFound();
    }
    return order;
  }
}
