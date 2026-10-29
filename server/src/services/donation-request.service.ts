import { Types } from 'mongoose';

import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import { conflict, notFound, unprocessable } from '../utils/http-errors.js';
import { domainEvents } from '../utils/domain-events.js';
import { toMongoPaging } from '../utils/response.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';
import { HANDOVER_EXPIRY_DAYS, PENDING_EXPIRY_DAYS } from '../constants/donation-request-transitions.js';
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
  type HandoverBody,
  type MyRequestsQuery,
} from '../validations/donation-request.validation.js';
import {
  adminContextOf,
  organizationNotAvailable,
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

// ---- Create (receiver, or an Admin for an organization) ---------------------------------------

export const createRequest = async (
  actor: DonationActor,
  input: CreateRequestBody & { organizationId?: string },
) => {
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
      if (String(toy.ownerId) === actor.userId) {
        throw unprocessable('OWN_TOY', 'Bạn không thể xin đồ chơi do chính mình tặng.');
      }
      // GB-05: the toys of a locked account are hidden, so they cannot be requested.
      if ((await repository.findUserStatus(toy.ownerId, session))?.toUpperCase() === 'LOCKED') {
        throw conflict('DONOR_LOCKED', 'Người quyên góp đang bị khóa, không thể gửi yêu cầu.');
      }
      if (input.organizationId) {
        if (!(await repository.touchActiveOrganization(input.organizationId, session))) {
          if (!(await repository.findOrganization(input.organizationId, session))) {
            throw notFound('ORGANIZATION_NOT_FOUND', 'Không tìm thấy tổ chức.');
          }
          throw organizationNotAvailable();
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
 * D-04: the Donor decides. An Admin may not accept or reject a PENDING request (not even an
 * organization request an Admin filed); Admins only resolve stuck ACCEPTED/SHIPPING requests
 * (cancel, confirm receipt). Runs after the 404 and status checks of the transition.
 */
const assertNotAdminDecision = (actor: DonationActor) => () => {
  if (actor.isAdmin) {
    throw conflict(
      'DONOR_DECISION_REQUIRED',
      'Chỉ người quyên góp mới được chấp nhận hoặc từ chối yêu cầu nhận tặng.',
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
      check: assertNotAdminDecision(actor),
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
      check: assertNotAdminDecision(actor),
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

export const handOver = async (actor: DonationActor, id: string, body: HandoverBody) => {
  assertOwnPhotos(actor, body.photos);
  return detailOf(
    await transition({
      id,
      to: 'shipping',
      unset: ['timer'],
      actor,
      allowed: canHandOver,
      pushHandover: handover('DONOR_SENT', actor, body),
    }),
    actor,
  );
};

export const confirmReceived = async (
  actor: DonationActor,
  id: string,
  body: Omit<ConfirmReceivedBody, 'photos'> & {
    photos?: ConfirmReceivedBody['photos'] | undefined;
  },
  options: { reason?: string | undefined } = {},
) => {
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
      },
      set: { completedAt: new Date() },
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
