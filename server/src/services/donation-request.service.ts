import { Types, type ClientSession } from 'mongoose';

import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import { AppError } from '../utils/app-error.js';
import { conflict, forbidden, notFound, unprocessable } from '../utils/http-errors.js';
import { domainEvents } from '../utils/domain-events.js';
import { toMongoPaging } from '../utils/response.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';
import {
  HANDOVER_EXPIRY_DAYS,
  PENDING_EXPIRY_DAYS,
  type HandoverMethod,
} from '../constants/donation-request-transitions.js';
import {
  type DonationView,
  encodePhoto,
  toDonationRequestDetailDto,
  toDonationRequestDto,
} from './donation-request.mapper.js';
import {
  cancellableFrom,
  canCancel,
  canConfirmReceipt,
  canDecide,
  canHandOver,
  canView,
  deciderOf,
  receiverTypeOf,
  type DonationActor,
} from './donation-request.policy.js';
import * as repository from '../repositories/donation-request.repository.js';
import type { DonationRecord, RequestFilter } from '../repositories/donation-request.repository.js';
import {
  donationRequestSortFields,
  HANDOVER_PHOTO_PATTERN,
  type ConfirmReceivedBody,
  type CreateRequestBody,
  type DonorOrganizationRequestBody,
  type HandoverBody,
  type MyRequestsQuery,
} from '../validations/donation-request.validation.js';
import {
  adminContextOf,
  organizationNotAccepting,
  organizationNotAvailable,
  organizationWithoutPoint,
  requestNotFound,
  toyNotAvailable,
  buildEvent,
  transition,
} from './donation-request.transition.js';

// Use cases of receivers and donors, plus the steps shared with the Admin service.

// ---- DTO helpers -----------------------------------------------------------------------------

/** The DTO view of an actor: Admins get masked contacts, users the D-03 counterpart. */
export const viewOf = (actor: DonationActor): DonationView =>
  actor.isAdmin ? { admin: true } : { admin: false, viewerId: actor.userId };

export const toDtos = async (records: DonationRecord[], view: DonationView) => {
  const relations = await repository.loadRelations(records, view.admin);
  return records.map((record) => toDonationRequestDto(record, relations, view));
};

export const toDetail = async (record: DonationRecord, view: DonationView) =>
  toDonationRequestDetailDto(record, await repository.loadRelations([record], view.admin), view);

export const listPage = async (
  filter: RequestFilter,
  query: MyRequestsQuery,
  view: DonationView,
) => {
  const { items, total } = await repository.listRequests(
    filter,
    toMongoPaging(query, donationRequestSortFields),
  );
  return { items: await toDtos(items, view), total };
};

// ---- Create (receiver, an Admin for an organization, or the Donor to an organization) ---------

/** GB-51/GB-58: the methods a receiving point accepts. No point (older organization): both. */
const allowedMethodsOf = (point: OrganizationPoint | undefined): HandoverMethod[] =>
  point
    ? [
        ...(point.acceptsDropOff ? (['drop_off'] as const) : []),
        ...(point.acceptsParcel ? (['carrier'] as const) : []),
      ]
    : ['drop_off', 'carrier'];

type OrganizationPoint = { acceptsDropOff: boolean; acceptsParcel: boolean };

const assertMethodAllowed = (method: HandoverMethod, point: OrganizationPoint | undefined) => {
  const allowed = allowedMethodsOf(point);
  if (!allowed.includes(method)) {
    throw unprocessable(
      'HANDOVER_METHOD_NOT_ALLOWED',
      method === 'drop_off'
        ? 'Điểm nhận của tổ chức không nhận đồ mang đến. Vui lòng gửi qua vận chuyển.'
        : 'Điểm nhận của tổ chức không nhận bưu kiện. Vui lòng mang đến điểm nhận.',
      { field: 'handoverMethod', allowed },
    );
  }
};

/**
 * RECEIVER: a User asks for someone else's post, or an Admin for an organization.
 * DONOR (UC33, GB-56): the Donor sends their own post to an organization; the Admin decides.
 */
type CreateSide = 'RECEIVER' | 'DONOR';

const insertPendingRequest = async (
  actor: DonationActor,
  input: CreateRequestBody & {
    organizationId?: string;
    handoverMethod?: HandoverMethod | undefined;
  },
  side: CreateSide,
) => {
  // GB-06, MSG17: a Receiver (and a Donor) is a verified User (R03 actors 5–6); same refusal as
  // the other actions that need a verified identity. An Admin acts for an organization.
  if (!actor.isAdmin && !(await repository.isVerifiedUser(actor.userId))) {
    throw new AppError(403, 'USER_NOT_VERIFIED', 'Tài khoản chưa được xác thực danh tính.');
  }
  const created = await repository
    .withTransaction(async (session) => {
      // Conditional writes, not reads: they conflict with a concurrent accept of the toy and a
      // concurrent hide or delete of the organization (see the repository).
      const toy = await repository.touchActiveDonationToy(input.toyId, session);
      if (!toy) {
        if (!(await repository.findToy(input.toyId, session))) {
          throw notFound('TOY_NOT_FOUND', 'Không tìm thấy đồ chơi.');
        }
        throw toyNotAvailable();
      }
      const ownToy = String(toy.ownerId) === actor.userId;
      if (side === 'RECEIVER' && ownToy) {
        throw unprocessable('OWN_TOY', 'Bạn không thể xin đồ chơi do chính mình tặng.');
      }
      if (side === 'DONOR' && !ownToy) {
        throw forbidden('Chỉ người đăng tin quyên góp mới gửi được đồ chơi này tới tổ chức.');
      }
      // GB-05: the toys of a locked account are hidden, so they cannot be requested.
      if ((await repository.findUserStatus(toy.ownerId, session))?.toUpperCase() === 'LOCKED') {
        throw conflict('DONOR_LOCKED', 'Người quyên góp đang bị khóa, không thể gửi yêu cầu.');
      }
      if (input.organizationId) {
        // GB-55: a new request needs an active organization that is accepting toys.
        const organization = await repository.touchActiveOrganization(
          input.organizationId,
          session,
          { accepting: true },
        );
        if (!organization) {
          const found = await repository.findOrganization(input.organizationId, session);
          if (!found) throw organizationNotFound();
          if (/^active$/i.test(found.status)) throw organizationNotAccepting();
          throw organizationNotAvailable();
        }
        // GB-51: no receiving point, no new request.
        if (!organization.receivingPoint) throw organizationWithoutPoint();
        // UC35 1.1, GB-53/GB-54: the Admin asks for a post only for an organization that takes
        // the toy's category.
        if (
          actor.isAdmin &&
          !(organization.categoryIds ?? []).some((id) => String(id) === String(toy.categoryId))
        ) {
          throw unprocessable(
            'ORGANIZATION_CATEGORY_NOT_ACCEPTED',
            'Tổ chức này không nhận đồ chơi thuộc danh mục của món đồ này.',
            [{ field: 'organizationId', message: 'Chọn tổ chức nhận danh mục của đồ chơi.' }],
          );
        }
        if (input.handoverMethod) {
          assertMethodAllowed(input.handoverMethod, organization.receivingPoint);
        }
      }

      const record = await repository.insertRequest(
        {
          toyId: toy._id,
          donorId: toy.ownerId,
          requestedBy: actor.userId,
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          // develop's itemDetails (required): the requester's message, else the toy title.
          itemDetails: input.message || toy.title,
          dueAt: daysFromNow(PENDING_EXPIRY_DAYS),
          ...(input.handoverMethod ? { handoverMethod: input.handoverMethod } : {}),
        },
        session,
      );
      if (actor.isAdmin) {
        await writeAuditLog(
          adminAuditEntry(adminContextOf(actor), 'donation.create', {
            kind: 'DONATION_REQUEST',
            id: String(record._id),
          }),
          session,
        );
      }
      return { record, toyTitle: toy.title };
    })
    .catch((error: unknown) => {
      // develop's one_pending_per_receiver: one pending request per toy and receiver.
      if (isDuplicateKeyError(error, 'one_pending_per_receiver')) {
        throw conflict(
          'DONATION_REQUEST_EXISTS',
          input.organizationId
            ? 'Tổ chức này đã có một yêu cầu đang chờ cho đồ chơi này.'
            : 'Bạn đã gửi yêu cầu cho đồ chơi này.',
        );
      }
      throw error;
    });
  const { record } = created;
  domainEvents.publish(buildEvent(record, created.toyTitle, undefined, 'pending', actor.userId));
  return toDetail(record, viewOf(actor));
};

export const createRequest = (
  actor: DonationActor,
  input: CreateRequestBody & { organizationId?: string },
) => insertPendingRequest(actor, input, 'RECEIVER');

/**
 * UC33 (GB-56): the Donor sends their own Active donation post to an organization that is
 * accepting toys (GB-55), with an optional note (max 300) and handover method. The request is
 * Pending and the Admin accepts or rejects it for the organization.
 */
export const createOrganizationRequestByDonor = (
  actor: DonationActor,
  input: DonorOrganizationRequestBody,
) => insertPendingRequest(actor, input, 'DONOR');

const organizationNotFound = () => notFound('ORGANIZATION_NOT_FOUND', 'Không tìm thấy tổ chức.');

/**
 * UC33 step 4 for a new donation post: the chosen organization takes toys now (GB-55, MSG51)
 * and its receiving point allows the method (GB-58), as POST /donation-requests/to-organization
 * checks. Checked again when the request is created after the Admin approves the post.
 */
export const assertOrganizationTakesToys = async (
  organizationId: string,
  handoverMethod: HandoverMethod,
) => {
  const organization = await repository.findOrganization(organizationId);
  if (!organization) throw organizationNotFound();
  if (!/^active$/i.test(organization.status)) throw organizationNotAvailable();
  if (organization.isAccepting === false) throw organizationNotAccepting();
  if (!organization.receivingPoint) throw organizationWithoutPoint();
  assertMethodAllowed(handoverMethod, organization.receivingPoint);
};

/**
 * UC33 step 5: the Admin approved a new donation post sent to an organization, so its request is
 * created as Pending, as if the Donor had sent the Active post to it (the Donor is its creator;
 * the Admin decides it, GB-56). When the organization no longer takes toys, no request is
 * created and the post stays open (step 6.1). Returns the request, or undefined.
 */
export const createRequestForApprovedPost = async (toyId: string) => {
  const toy = await repository.takeDonationTarget(toyId);
  if (!toy) return undefined;
  const { organizationId, handoverMethod } = toy.donationTarget;
  try {
    return await insertPendingRequest(
      { userId: String(toy.ownerId), isAdmin: false },
      { toyId, organizationId: String(organizationId), handoverMethod },
      'DONOR',
    );
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      console.info(`Donation request not created for the approved post ${toyId}: ${error.code}`);
      return undefined;
    }
    throw error;
  }
};

// ---- Reads -----------------------------------------------------------------------------------

const statusFilter = (query: MyRequestsQuery) => (query.status ? { status: query.status } : {});

// Requests an Admin filed for an organization belong to the admin screens, not to "mine".
export const listMine = (actor: DonationActor, query: MyRequestsQuery) =>
  listPage(
    {
      requestedBy: new Types.ObjectId(actor.userId),
      'receiver.organizationId': { $exists: false },
      ...statusFilter(query),
    },
    query,
    viewOf(actor),
  );

export const listIncoming = (actor: DonationActor, query: MyRequestsQuery) =>
  listPage(
    { donorId: new Types.ObjectId(actor.userId), ...statusFilter(query) },
    query,
    viewOf(actor),
  );

export const getRequest = async (actor: DonationActor, id: string) => {
  const record = await repository.findRequestById(id);
  if (!record || !canView(record, actor)) throw requestNotFound();
  return toDetail(record, viewOf(actor));
};

/** Public donor profile: number of completed donations, counted on demand. */
export const getDonorSummary = async (userId: string) => {
  if (!(await repository.userExists(userId))) {
    throw notFound('USER_NOT_FOUND', 'Không tìm thấy người dùng.');
  }
  return { userId, completedDonations: await repository.countCompletedByDonor(userId) };
};

// ---- Moves -----------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

const decided = (actor: DonationActor) => ({
  decidedBy: new Types.ObjectId(actor.userId),
  decidedAt: new Date(),
});

const detailOf = async (record: DonationRecord, actor: DonationActor) =>
  toDetail(record, viewOf(actor));

/**
 * GB-56: the side that did not create the request decides it. The Admin decides a request the
 * Donor sent to an organization (409 ADMIN_DECISION_REQUIRED for the Donor); the Donor decides
 * a request from a Receiver or from the Admin for an organization (409 DONOR_DECISION_REQUIRED
 * for an Admin). Runs after the 404 and status checks of the transition.
 */
const assertDecider = (actor: DonationActor) => (record: DonationRecord) => {
  const decider = deciderOf(record);
  if (decider === 'DONOR' && actor.isAdmin) {
    throw conflict(
      'DONOR_DECISION_REQUIRED',
      'Người quyên góp chấp nhận hoặc từ chối yêu cầu này.',
    );
  }
  if (decider === 'ADMIN' && !actor.isAdmin) {
    throw conflict(
      'ADMIN_DECISION_REQUIRED',
      'Admin sẽ chấp nhận hoặc từ chối yêu cầu bạn gửi tới tổ chức.',
    );
  }
};

export const accept = async (actor: DonationActor, id: string) =>
  detailOf(
    await transition({
      id,
      to: 'accepted',
      actor,
      allowed: canDecide,
      check: assertDecider(actor),
      // The donor now has HANDOVER_EXPIRY_DAYS to hand the toy over.
      set: { ...decided(actor), 'timer.dueAt': daysFromNow(HANDOVER_EXPIRY_DAYS) },
    }),
    actor,
  );

export const reject = async (actor: DonationActor, id: string, reason: string) =>
  detailOf(
    await transition({
      id,
      to: 'rejected',
      actor,
      allowed: canDecide,
      check: assertDecider(actor),
      set: { ...decided(actor), rejectReason: reason },
      unset: ['timer'],
      reason,
    }),
    actor,
  );

/** `note`: optional for a user, the required reason for an Admin. */
export const cancel = async (
  actor: DonationActor,
  id: string,
  body: { note?: string | undefined },
) =>
  detailOf(
    await transition({
      id,
      to: 'cancelled',
      actor,
      allowed: canCancel,
      allowedFrom: cancellableFrom(actor),
      set: {
        cancellation: {
          reason: actor.isAdmin ? 'CANCELLED_BY_ADMIN' : 'CANCELLED_BY_USER',
          actorType: actor.isAdmin ? 'ADMIN' : 'USER',
          by: new Types.ObjectId(actor.userId),
          ...(body.note ? { note: body.note } : {}),
          at: new Date(),
        },
      },
      unset: ['timer'],
      ...(body.note ? { reason: body.note } : {}),
    }),
    actor,
  );

/** Every photo must be the caller's own HANDOVER_PHOTO upload (uploads feature). */
const assertOwnPhotos = (actor: DonationActor, photos: HandoverBody['photos'] | undefined) => {
  const foreign = (photos ?? []).filter(
    (photo) => HANDOVER_PHOTO_PATTERN.exec(photo.publicId)?.[1] !== actor.userId,
  );
  if (foreign.length > 0) {
    throw unprocessable(
      'HANDOVER_PHOTO_NOT_OWNED',
      'Ảnh bàn giao phải do chính bạn tải lên với mục đích HANDOVER_PHOTO.',
      { publicIds: foreign.map((photo) => photo.publicId) },
    );
  }
};

const handover = (
  step: 'DONOR_SENT' | 'RECEIVER_RECEIVED',
  actor: DonationActor,
  body: { photos: HandoverBody['photos']; note?: string | undefined },
) => ({
  step,
  by: new Types.ObjectId(actor.userId),
  photos: body.photos.map(encodePhoto),
  ...(body.note ? { note: body.note } : {}),
  at: new Date(),
});

/** GB-58: an organization's receiving point limits the method; a User receiver takes both. */
const assertMethodForRequest =
  (method: HandoverMethod) => async (record: DonationRecord, session: ClientSession) => {
    const organizationId = record.receiver?.organizationId;
    if (!organizationId) return;
    const organization = await repository.findOrganization(organizationId, session);
    assertMethodAllowed(method, organization?.receivingPoint);
  };

export const handOver = async (actor: DonationActor, id: string, body: HandoverBody) => {
  assertOwnPhotos(actor, body.photos);
  const carrier = body.handoverMethod === 'carrier';
  return detailOf(
    await transition({
      id,
      to: 'shipping',
      unset: [
        'timer',
        // A method chosen at the request may change; drop the carrier fields of a drop-off.
        ...(carrier ? [] : ['carrierName', 'trackingCode']),
      ],
      actor,
      allowed: canHandOver,
      check: assertMethodForRequest(body.handoverMethod),
      set: {
        handoverMethod: body.handoverMethod,
        ...(carrier && body.carrierName ? { carrierName: body.carrierName } : {}),
        ...(carrier && body.trackingCode ? { trackingCode: body.trackingCode } : {}),
      },
      pushHandover: handover('DONOR_SENT', actor, body),
    }),
    actor,
  );
};

/** GB-59: what the Admin records when an organization confirms receipt. */
export interface OrganizationReceipt {
  confirmedBy?: string | undefined;
  channel?: 'phone' | 'email' | 'in_person' | undefined;
  // YYYY-MM-DD, Vietnam time.
  receivedAt?: string | undefined;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
/** The Vietnam calendar day of an instant: "2026-11-17". */
const vietnamDay = (date: Date) => new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
/** "2026-11-17" -> 2026-11-17T00:00:00+07:00. */
const fromVietnamDay = (day: string) => new Date(`${day}T00:00:00+07:00`);

/**
 * GB-59 for an organization: who confirmed, the channel, the received date and at least one
 * photo (MSG53). The date is not before the sent date and not in the future.
 */
const assertOrganizationReceipt = (
  record: DonationRecord,
  receipt: OrganizationReceipt,
  photoCount: number,
) => {
  const missing = [
    ...(receipt.confirmedBy ? [] : ['confirmedBy']),
    ...(receipt.channel ? [] : ['channel']),
    ...(receipt.receivedAt ? [] : ['receivedAt']),
  ];
  if (missing.length > 0) {
    throw unprocessable(
      'RECEIPT_DETAILS_REQUIRED',
      'Cần nhập người xác nhận, kênh xác nhận và ngày nhận của tổ chức.',
      missing.map((field) => ({ field, message: 'Bắt buộc khi xác nhận cho tổ chức.' })),
    );
  }
  if (photoCount === 0) {
    throw unprocessable('RECEIPT_PHOTO_REQUIRED', 'Vui lòng tải lên ít nhất một ảnh nhận hàng.', [
      { field: 'photos', message: 'Cần ít nhất một ảnh.' },
    ]);
  }
  const sent = record.handovers.find((item) => item.step === 'DONOR_SENT');
  const day = receipt.receivedAt!;
  if (day > vietnamDay(new Date()) || (sent && day < vietnamDay(sent.at))) {
    throw unprocessable(
      'RECEIVED_AT_INVALID',
      'Ngày nhận không được trước ngày gửi và không được ở tương lai.',
      [{ field: 'receivedAt', message: 'Ngày nhận không hợp lệ.' }],
    );
  }
};

export const confirmReceived = async (
  actor: DonationActor,
  id: string,
  body: Omit<ConfirmReceivedBody, 'photos'> & {
    photos?: ConfirmReceivedBody['photos'] | undefined;
  },
  options: { reason?: string | undefined; receipt?: OrganizationReceipt } = {},
) => {
  const receipt = options.receipt ?? {};
  // GB-20: the receiving user always gives receipt photos (the route schema requires them).
  if (!actor.isAdmin && (body.photos ?? []).length === 0) {
    throw unprocessable(
      'HANDOVER_PHOTOS_REQUIRED',
      'Cần tải lên ít nhất một ảnh đồ chơi khi xác nhận đã nhận.',
    );
  }
  assertOwnPhotos(actor, body.photos);
  return detailOf(
    await transition({
      id,
      to: 'completed',
      actor,
      allowed: canConfirmReceipt,
      // An Admin confirming for a USER receiver (who never confirmed) must give a reason.
      check: (record) => {
        if (actor.isAdmin && receiverTypeOf(record) === 'USER' && !options.reason) {
          throw unprocessable(
            'REASON_REQUIRED',
            'Cần nhập lý do khi Admin xác nhận đã nhận thay người nhận.',
          );
        }
        if (actor.isAdmin && receiverTypeOf(record) === 'ORGANIZATION') {
          assertOrganizationReceipt(record, receipt, (body.photos ?? []).length);
        }
      },
      set: (record) => ({
        completedAt: new Date(),
        ...(actor.isAdmin && receiverTypeOf(record) === 'ORGANIZATION'
          ? {
              confirmedBy: receipt.confirmedBy,
              channel: receipt.channel,
              receivedAt: fromVietnamDay(receipt.receivedAt!),
            }
          : {}),
      }),
      ...(body.photos
        ? {
            pushHandover: handover('RECEIVER_RECEIVED', actor, {
              photos: body.photos,
              note: body.note,
            }),
          }
        : {}),
      ...(body.note ? { reason: body.note } : {}),
    }),
    actor,
  );
};
