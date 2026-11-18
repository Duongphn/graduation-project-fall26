import { type Model, Types } from 'mongoose';
import {
  type DisputeVerdict,
  OWNER_DISPUTE_REASONS,
  RENTER_DISPUTE_REASONS,
} from '../constants/dispute.js';
import { type DisputableOrders } from '../interfaces/dispute.ports.js';
import {
  type Clock,
  type RentalNotifier,
  type RentalPhotoStorage,
  type RentalSettingsProvider,
  systemClock,
} from '../interfaces/rental-order.ports.js';
import { Dispute, type IDispute } from '../models/dispute.model.js';
import { type IUser, User } from '../models/user.model.js';
import { RentalOrderRepository } from '../repositories/rental-order.repository.js';
import { type RentalOrderDto } from '../types/rental-order.types.js';
import { type RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import {
  type AdminDisputeListQuery,
  type ListDisputesQuery,
  type ResolveDisputeInput,
  validateOpenDisputeInput,
  validateRespondDisputeInput,
} from '../validations/dispute.validation.js';
import { notifyAdmins } from './admin-notify.js';
import {
  type AdminDisputeCaseDto,
  type AdminDisputeDto,
  type DisputeDto,
  type PartyDto,
  toAdminDisputeDto,
  toDisputeDto,
} from './dispute.mapper.js';
import { type PhotoLimits, withUploadedPhotos } from './photo-upload.js';
import { type ClaimantRole, type Payout } from './rental-pricing.js';

const EVIDENCE_PHOTO_LIMITS: PhotoLimits = { min: 1, max: 10 };
const RESPONSE_PHOTO_LIMITS: PhotoLimits = { min: 0, max: 10 };
const HOUR_MS = 3_600_000;

const REASONS_BY_ROLE: Record<ClaimantRole, readonly string[]> = {
  renter: RENTER_DISPUTE_REASONS,
  owner: OWNER_DISPUTE_REASONS,
};

export interface DisputeCodeGenerator {
  generateCode(now: Date): string;
}

export interface DisputeServiceDeps {
  orders: DisputableOrders;
  photos: RentalPhotoStorage;
  notifier: RentalNotifier;
  clock?: Clock;
  settings: RentalSettingsProvider;
  /** Order code generator; dispute codes reuse it with the `DP` prefix. */
  codes?: DisputeCodeGenerator;
  userModel?: Model<IUser>;
  disputeModel?: Model<IDispute>;
}

function alreadyExists(): AppError {
  return new AppError(409, 'DISPUTE_ALREADY_EXISTS', 'Đơn này đã có khiếu nại.');
}

function notOpen(): AppError {
  return new AppError(409, 'DISPUTE_NOT_OPEN', 'Khiếu nại không còn ở trạng thái chờ phản hồi.');
}

function notUnderReview(): AppError {
  return new AppError(
    409,
    'DISPUTE_NOT_UNDER_REVIEW',
    'Khiếu nại không ở trạng thái chờ quản trị viên xem xét.',
  );
}

function notFound(): AppError {
  return new AppError(404, 'DISPUTE_NOT_FOUND', 'Không tìm thấy khiếu nại.');
}

const VERDICT_LABELS: Record<DisputeVerdict, string> = {
  CLAIMANT_FAVORED: 'chấp nhận khiếu nại',
  RESPONDENT_FAVORED: 'bác khiếu nại',
  PARTIAL: 'chấp nhận một phần khiếu nại',
};

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} đ`;
}

/**
 * RESPONDENT_FAVORED pays nothing, the other verdicts pay something;
 * when the cap is 0 nothing can be paid, so every verdict comes with 0.
 */
function assertVerdictMatches(verdict: DisputeVerdict, compensation: number, cap: number): void {
  const mustBeZero = cap === 0 || verdict === 'RESPONDENT_FAVORED';
  if (mustBeZero ? compensation !== 0 : compensation <= 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      mustBeZero
        ? 'Phán quyết này không kèm tiền bồi thường; số tiền phải bằng 0.'
        : 'Phán quyết này phải kèm số tiền bồi thường lớn hơn 0.',
    );
  }
}

/** A duplicate-key error on the one-dispute-per-order index (not on, say, `code`). */
function isDuplicateOrderKey(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || (err as { code?: unknown }).code !== 11000) {
    return false;
  }
  const { keyPattern, keyValue } = err as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
  };
  return (
    Boolean(keyPattern && 'orderId' in keyPattern) || Boolean(keyValue && 'orderId' in keyValue)
  );
}

/** Dispute rules (UC17–19); everything about the order itself goes through `DisputableOrders`. */
export class DisputeService {
  private readonly orders: DisputableOrders;
  private readonly photos: RentalPhotoStorage;
  private readonly notifier: RentalNotifier;
  private readonly clock: Clock;
  private readonly settings: RentalSettingsProvider;
  private readonly codes: DisputeCodeGenerator;
  private readonly userModel: Model<IUser>;
  private readonly disputeModel: Model<IDispute>;

  public constructor(deps: DisputeServiceDeps) {
    this.orders = deps.orders;
    this.photos = deps.photos;
    this.notifier = deps.notifier;
    this.clock = deps.clock ?? systemClock;
    this.settings = deps.settings;
    this.codes = deps.codes ?? new RentalOrderRepository();
    this.userModel = deps.userModel ?? User;
    this.disputeModel = deps.disputeModel ?? Dispute;
  }

  /** UC17: a party of the order opens the (single) dispute of that order. */
  public async open(
    actor: RequestActor,
    orderId: string,
    rawInput: unknown,
    files: Express.Multer.File[],
  ): Promise<{ dispute: DisputeDto; order: RentalOrderDto }> {
    const now = this.clock.now();
    const context = await this.orders
      .assertCanOpen(actor.userId, orderId, now)
      .catch(async (err: unknown) => {
        throw await this.toOpenError(err, orderId);
      });

    const input = validateOpenDisputeInput(rawInput);
    if (!REASONS_BY_ROLE[context.claimantRole].includes(input.reason)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Lý do khiếu nại không hợp lệ.', {
        allowed: REASONS_BY_ROLE[context.claimantRole],
      });
    }

    // assertCanOpen found the order, so the id is a valid ObjectId
    const orderType = this.orders.orderType;
    const orderObjectId = new Types.ObjectId(orderId);
    if (await this.disputeModel.exists({ orderType, orderId: orderObjectId })) {
      throw alreadyExists();
    }

    const { disputeResponseHours } = await this.settings.getRentalSettings();
    const disputeId = new Types.ObjectId();
    let created: IDispute | undefined;

    let order: RentalOrderDto;
    try {
      order = await withUploadedPhotos(this.photos, files, EVIDENCE_PHOTO_LIMITS, (photos) =>
        this.orders.markDisputed({
          orderId,
          claimantRole: context.claimantRole,
          disputeId,
          actorId: actor.userId,
          now,
          evidence: { photos, description: input.description },
          inTransaction: async (session) => {
            const [doc] = await this.disputeModel.create(
              [
                {
                  _id: disputeId,
                  code: 'DP' + this.codes.generateCode(now).slice(2),
                  orderType,
                  orderId: orderObjectId,
                  claimantId: new Types.ObjectId(context.claimantId),
                  respondentId: new Types.ObjectId(context.respondentId),
                  claimantRole: context.claimantRole,
                  reason: input.reason,
                  description: input.description,
                  evidencePhotos: photos,
                  status: 'open',
                  openedAt: now,
                  timer: { dueAt: new Date(now.getTime() + disputeResponseHours * HOUR_MS) },
                },
              ],
              { session },
            );
            created = doc;
          },
        }),
      );
    } catch (err) {
      throw await this.toOpenError(err, orderId);
    }

    if (!created) {
      throw new Error('Dispute was not created');
    }

    await this.notifyOpened(
      context.claimantRole,
      context.respondentId,
      context.orderCode,
      created,
      disputeResponseHours,
    );

    return { dispute: toDisputeDto(created, actor.userId), order };
  }

  /** UC18: the respondent answers once, inside the response window. */
  public async respond(
    actor: RequestActor,
    disputeId: string,
    input: unknown,
    files: Express.Multer.File[],
  ): Promise<DisputeDto> {
    const dispute = await this.findForParty(actor.userId, disputeId);
    if (dispute.claimantId.toString() === actor.userId) {
      throw new AppError(
        403,
        'FORBIDDEN_RENTAL_ACTION',
        'Bên khiếu nại không thể phản hồi khiếu nại của chính mình.',
      );
    }
    const { message } = validateRespondDisputeInput(input);

    const now = this.clock.now();
    if (dispute.status !== 'open') {
      throw notOpen();
    }
    if (!dispute.timer?.dueAt || dispute.timer.dueAt <= now) {
      throw new AppError(400, 'RESPONSE_WINDOW_CLOSED', 'Đã hết thời hạn phản hồi khiếu nại.');
    }

    const updated = await withUploadedPhotos(
      this.photos,
      files,
      RESPONSE_PHOTO_LIMITS,
      async (photos) => {
        const doc = await this.disputeModel.findOneAndUpdate(
          { _id: dispute._id, status: 'open', 'timer.dueAt': { $gt: now } },
          {
            $set: {
              status: 'under_review',
              response: { message, photos, respondedAt: now },
              reviewStartedAt: now,
            },
            $unset: { timer: 1 },
          },
          { new: true },
        );
        if (!doc) {
          throw notOpen();
        }
        return doc;
      },
    );

    const orderCode = await this.orderCodeOf(updated);
    await this.notify(
      updated.claimantId.toString(),
      'Khiếu nại đã có phản hồi',
      `Bên còn lại đã phản hồi khiếu nại ${updated.code} của đơn thuê ${orderCode}. Khiếu nại đang được quản trị viên xem xét.`,
    );
    await notifyAdmins(
      this.notifier,
      this.userModel,
      'Khiếu nại cần xem xét',
      `Khiếu nại ${updated.code} của đơn thuê ${orderCode} đã có phản hồi và đang chờ xem xét.`,
    );

    return toDisputeDto(updated, actor.userId);
  }

  /** Moves every dispute whose response window is over to admin review (`responseMissed`). */
  public async expireResponses(): Promise<{ moved: number }> {
    const now = this.clock.now();
    const due = await this.disputeModel
      .find({ status: 'open', 'timer.dueAt': { $lte: now } }, { _id: 1 })
      .lean();

    let moved = 0;
    for (const { _id } of due) {
      const doc = await this.disputeModel.findOneAndUpdate(
        { _id, status: 'open', 'timer.dueAt': { $lte: now } },
        {
          $set: { status: 'under_review', responseMissed: true, reviewStartedAt: now },
          $unset: { timer: 1 },
        },
        { new: true },
      );
      if (!doc) {
        continue; // answered or moved by someone else in the meantime
      }
      moved += 1;
      const orderCode = await this.orderCodeOf(doc);
      const text = `Khiếu nại ${doc.code} của đơn thuê ${orderCode} không nhận được phản hồi trong thời hạn nên chuyển sang quản trị viên xem xét.`;
      await this.notify(doc.claimantId.toString(), 'Khiếu nại chuyển sang xem xét', text);
      await this.notify(doc.respondentId.toString(), 'Khiếu nại chuyển sang xem xét', text);
      await notifyAdmins(this.notifier, this.userModel, 'Khiếu nại cần xem xét', text);
    }
    return { moved };
  }

  public async getForParty(actor: RequestActor, disputeId: string): Promise<DisputeDto> {
    return toDisputeDto(await this.findForParty(actor.userId, disputeId), actor.userId);
  }

  public async listMine(
    actor: RequestActor,
    query: ListDisputesQuery,
  ): Promise<{ items: DisputeDto[]; total: number; page: number; limit: number }> {
    const me = new Types.ObjectId(actor.userId);
    const filter: Record<string, unknown> = {};
    if (query.role === 'claimant') {
      filter.claimantId = me;
    } else if (query.role === 'respondent') {
      filter.respondentId = me;
    } else {
      filter.$or = [{ claimantId: me }, { respondentId: me }];
    }
    if (query.status) {
      filter.status = query.status;
    }

    const [docs, total] = await Promise.all([
      this.disputeModel
        .find(filter)
        .sort({ openedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.disputeModel.countDocuments(filter),
    ]);
    return {
      items: docs.map((d) => toDisputeDto(d, actor.userId)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** UC19 queue: under review by default, oldest review first; other statuses newest first. */
  public async adminList(
    query: AdminDisputeListQuery,
  ): Promise<{ items: AdminDisputeDto[]; total: number; page: number; limit: number }> {
    const status = query.status ?? 'under_review';
    const filter = { status };
    const sort: Record<string, 1 | -1> =
      status === 'under_review' ? { reviewStartedAt: 1, _id: 1 } : { openedAt: -1, _id: -1 };

    const [docs, total] = await Promise.all([
      this.disputeModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.disputeModel.countDocuments(filter),
    ]);
    return { items: docs.map(toAdminDisputeDto), total, page: query.page, limit: query.limit };
  }

  /** UC19: everything the Admin needs to decide. */
  public async adminCaseFile(disputeId: string): Promise<AdminDisputeCaseDto> {
    const dispute = await this.findById(disputeId);
    const orderId = dispute.orderId.toString();
    const [claimant, respondent, caseFile, compensationCap] = await Promise.all([
      this.partyOf(dispute.claimantId),
      this.partyOf(dispute.respondentId),
      this.orders.caseFile(orderId),
      this.orders.compensationCap(orderId, dispute.claimantRole),
    ]);
    return {
      dispute: toAdminDisputeDto(dispute),
      claimant,
      respondent,
      caseFile,
      compensationCap,
      conversation: null,
      aiAssessment: null,
    };
  }

  /**
   * UC19: one verdict per dispute. Closing the dispute, splitting the escrow and completing
   * the order commit together; a second (or concurrent) verdict gets 409 and posts nothing.
   */
  public async resolve(
    admin: RequestActor,
    disputeId: string,
    input: ResolveDisputeInput,
  ): Promise<AdminDisputeDto> {
    const dispute = await this.findById(disputeId);
    if (
      dispute.claimantId.toString() === admin.userId ||
      dispute.respondentId.toString() === admin.userId
    ) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Quản trị viên là một bên của khiếu nại nên không thể phân xử.',
      );
    }
    if (dispute.status !== 'under_review') {
      throw notUnderReview();
    }

    const orderId = dispute.orderId.toString();
    const cap = await this.orders.compensationCap(orderId, dispute.claimantRole);
    if (input.compensation > cap) {
      throw new AppError(
        400,
        'COMPENSATION_TOO_HIGH',
        'Số tiền bồi thường vượt mức tối đa cho phép.',
        { max: cap },
      );
    }
    assertVerdictMatches(input.verdict, input.compensation, cap);

    const now = this.clock.now();
    let payout: Payout;
    try {
      payout = await this.orders.settleDispute({
        orderId,
        claimantRole: dispute.claimantRole,
        compensation: input.compensation,
        adminId: admin.userId,
        note: `Quản trị viên ban hành phán quyết khiếu nại ${dispute.code}`,
        inTransaction: async (session, split) => {
          const result = await this.disputeModel.updateOne(
            { _id: dispute._id, status: 'under_review' },
            {
              $set: {
                status: 'resolved',
                resolution: {
                  verdict: input.verdict,
                  compensation: input.compensation,
                  reason: input.reason,
                  resolvedAt: now,
                  payout: split,
                },
                resolvedBy: new Types.ObjectId(admin.userId),
              },
            },
            { session },
          );
          if (result.matchedCount === 0) {
            throw notUnderReview();
          }
        },
      });
    } catch (err) {
      // The loser of two concurrent verdicts finds the order already COMPLETED
      if (err instanceof AppError && err.code === 'INVALID_RENTAL_TRANSITION') {
        const current = await this.disputeModel.findById(dispute._id, { status: 1 }).lean();
        if (current?.status !== 'under_review') {
          throw notUnderReview();
        }
      }
      throw err;
    }

    const resolved = await this.findById(disputeId);
    await this.notifyResolved(resolved, input.verdict, payout);
    return toAdminDisputeDto(resolved);
  }

  private async findById(disputeId: string): Promise<IDispute> {
    const dispute = Types.ObjectId.isValid(disputeId)
      ? await this.disputeModel.findById(disputeId)
      : null;
    if (!dispute) {
      throw notFound();
    }
    return dispute;
  }

  /** A dispute is invisible (404) to anyone who is not its claimant or respondent. */
  private async findForParty(userId: string, disputeId: string): Promise<IDispute> {
    const dispute = await this.findById(disputeId);
    if (dispute.claimantId.toString() !== userId && dispute.respondentId.toString() !== userId) {
      throw notFound();
    }
    return dispute;
  }

  private async partyOf(userId: Types.ObjectId): Promise<PartyDto> {
    const user = await this.userModel.findById(userId);
    return {
      id: userId.toString(),
      fullName: user?.fullName ?? '',
      avatar: user?.avatar ?? undefined,
      trustScore: user?.trust?.score ?? undefined,
      verified: user?.verificationStatus === 'verified',
    };
  }

  /** Order code for notifications; a failed lookup must not fail a step that is already committed. */
  private async orderCodeOf(dispute: IDispute): Promise<string> {
    try {
      return await this.orders.orderCode(dispute.orderId.toString());
    } catch {
      return dispute.orderId.toString();
    }
  }

  /** Each party learns the verdict and the amount it receives; the platform share stays internal. */
  private async notifyResolved(
    dispute: IDispute,
    verdict: DisputeVerdict,
    payout: Payout,
  ): Promise<void> {
    const orderCode = await this.orderCodeOf(dispute);
    const claimantId = dispute.claimantId.toString();
    const respondentId = dispute.respondentId.toString();
    const ownerId = dispute.claimantRole === 'owner' ? claimantId : respondentId;
    const renterId = dispute.claimantRole === 'owner' ? respondentId : claimantId;
    const text = (amount: number) =>
      `Quản trị viên đã ${VERDICT_LABELS[verdict]} ${dispute.code} của đơn thuê ${orderCode}. ` +
      `Số tiền bạn nhận về ví: ${formatVnd(amount)}. Đơn thuê đã hoàn tất.`;

    await this.notify(ownerId, 'Khiếu nại đã có phán quyết', text(payout.owner));
    await this.notify(renterId, 'Khiếu nại đã có phán quyết', text(payout.renter));
  }

  /**
   * An order that already has its dispute is no longer IN_USE/RETURNING, so the status check fails
   * first; the loser of two concurrent openings may also hit the unique index (11000).
   * Both mean the order already has its dispute.
   */
  private async toOpenError(err: unknown, orderId: string): Promise<unknown> {
    if (isDuplicateOrderKey(err)) {
      return alreadyExists();
    }
    if (err instanceof AppError && err.code === 'INVALID_RENTAL_TRANSITION') {
      const exists = await this.disputeModel
        .exists({ orderType: this.orders.orderType, orderId: new Types.ObjectId(orderId) })
        .catch(() => null);
      if (exists) {
        return alreadyExists();
      }
    }
    return err;
  }

  private async notify(userId: string, title: string, body: string): Promise<void> {
    try {
      await this.notifier.notify({ userId, title, body });
    } catch {
      // Swallows error: the dispute is already committed
    }
  }

  private async notifyOpened(
    claimantRole: ClaimantRole,
    respondentId: string,
    orderCode: string,
    dispute: IDispute,
    responseHours: number,
  ): Promise<void> {
    const deadline = `Vui lòng phản hồi kèm giải thích và ảnh (nếu có) trong vòng ${responseHours} giờ.`;
    if (claimantRole === 'owner') {
      await this.notify(
        respondentId,
        'Đơn thuê có khiếu nại đồ chơi bị hỏng',
        `Chủ đồ chơi đã gửi khiếu nại ${dispute.code} cho đơn thuê ${orderCode} khi nhận lại đồ chơi. ${deadline}`,
      );
    } else {
      await this.notify(
        respondentId,
        'Người thuê đã gửi khiếu nại đơn thuê',
        `Người thuê đã gửi khiếu nại ${dispute.code} cho đơn thuê ${orderCode}. ${deadline}`,
      );
    }

    await notifyAdmins(
      this.notifier,
      this.userModel,
      'Khiếu nại đơn thuê mới',
      `Đơn thuê ${orderCode} có khiếu nại ${dispute.code} từ ${claimantRole === 'owner' ? 'chủ đồ chơi' : 'người thuê'}.`,
    );
  }
}
