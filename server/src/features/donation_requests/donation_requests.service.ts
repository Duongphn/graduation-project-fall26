import { Types } from 'mongoose';

import { adminAuditEntry, writeAuditLog } from '../../infrastructure/database/audit.js';
import { withTransaction } from '../../infrastructure/database/schema-types.js';
import { conflict, notFound, unprocessable } from '../../shared/errors/app-error.js';
import { domainEvents } from '../../shared/events/domain-events.js';
import { toMongoPaging } from '../../shared/utils/response.js';
import { isDuplicateKeyError } from '../../shared/utils/mongo-errors.js';
import {
  encodePhoto,
  toDonationRequestDetailDto,
  toDonationRequestDto,
} from './donation_requests.mapper.js';
import {
  cancellableFrom,
  canCancel,
  canConfirmReceipt,
  canDecide,
  canHandOver,
  canView,
  type DonationActor,
} from './donation_requests.policy.js';
import * as repository from './donation_requests.repository.js';
import type { DonationRecord, RequestFilter } from './donation_requests.repository.js';
import {
  donationRequestSortFields,
  HANDOVER_PHOTO_PATTERN,
  type ConfirmReceivedBody,
  type CreateRequestBody,
  type HandoverBody,
  type MyRequestsQuery,
} from './donation_requests.schemas.js';
import {
  actorReference,
  adminContextOf,
  organizationNotAvailable,
  requestNotFound,
  toyNotAvailable,
  transition,
} from './donation_requests.transition.js';

// Use cases of receivers and donors, plus the steps shared with the Admin service.

// ---- DTO helpers -----------------------------------------------------------------------------

export const toDtos = async (records: DonationRecord[], withContacts = false) => {
  const relations = await repository.loadRelations(records, withContacts);
  return records.map((record) => toDonationRequestDto(record, relations, withContacts));
};

export const toDetail = async (record: DonationRecord, withContacts = false) => {
  const [relations, history] = await Promise.all([
    repository.loadRelations([record], withContacts),
    repository.findHistory(record._id),
  ]);
  return toDonationRequestDetailDto(record, relations, history, withContacts);
};

export const listPage = async (
  filter: RequestFilter,
  query: MyRequestsQuery,
  withContacts = false,
) => {
  const { items, total } = await repository.listRequests(
    filter,
    toMongoPaging(query, donationRequestSortFields),
  );
  return { items: await toDtos(items, withContacts), total };
};

// ---- Create (receiver, or an Admin for an organization) ---------------------------------------

export const createRequest = async (
  actor: DonationActor,
  input: CreateRequestBody & { organizationId?: string },
) => {
  const created = await withTransaction(async (session) => {
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
        receiverType: input.organizationId ? 'ORGANIZATION' : 'USER',
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.message ? { message: input.message } : {}),
      },
      session,
    );
    const actorRef = actorReference(actor);
    await repository.insertHistory(
      [{ orderId: record._id, toStatus: 'PENDING', actor: actorRef }],
      session,
    );
    if (actor.isAdmin) {
      await writeAuditLog(
        adminAuditEntry(
          adminContextOf(actor),
          'donation.create',
          { kind: 'DONATION_REQUEST', id: String(record._id) },
          { toyId: input.toyId, organizationId: input.organizationId },
        ),
        session,
      );
    }
    return { record, toyTitle: toy.title };
  }).catch((error: unknown) => {
    if (isDuplicateKeyError(error, 'one_pending_per_requester')) {
      throw conflict('DONATION_REQUEST_EXISTS', 'Bạn đã gửi yêu cầu cho đồ chơi này.');
    }
    if (isDuplicateKeyError(error, 'one_pending_per_organization')) {
      throw conflict(
        'DONATION_REQUEST_EXISTS',
        'Tổ chức này đã có một yêu cầu đang chờ cho đồ chơi này.',
      );
    }
    throw error;
  });
  const { record } = created;
  domainEvents.publish({
    type: 'DONATION_STATUS_CHANGED',
    donationRequestId: String(record._id),
    toyId: String(record.toyId),
    toyTitle: created.toyTitle,
    donorId: String(record.donorId),
    requestedBy: String(record.requestedBy),
    receiverType: record.receiverType,
    ...(record.organizationId ? { organizationId: String(record.organizationId) } : {}),
    to: 'PENDING',
    changedBy: actor.userId,
  });
  return toDetail(record, actor.isAdmin);
};

// ---- Reads -----------------------------------------------------------------------------------

const statusFilter = (query: MyRequestsQuery) => (query.status ? { status: query.status } : {});

// Requests an Admin filed for an organization belong to the admin screens, not to "mine".
export const listMine = (actor: DonationActor, query: MyRequestsQuery) =>
  listPage(
    {
      requestedBy: new Types.ObjectId(actor.userId),
      receiverType: 'USER',
      ...statusFilter(query),
    },
    query,
  );

export const listIncoming = (actor: DonationActor, query: MyRequestsQuery) =>
  listPage({ donorId: new Types.ObjectId(actor.userId), ...statusFilter(query) }, query);

export const getRequest = async (actor: DonationActor, id: string) => {
  const record = await repository.findRequestById(id);
  if (!record || !canView(record, actor)) throw requestNotFound();
  return toDetail(record, actor.isAdmin);
};

/** Public donor profile: number of completed donations, counted on demand. */
export const getDonorSummary = async (userId: string) => {
  if (!(await repository.userExists(userId))) {
    throw notFound('USER_NOT_FOUND', 'Không tìm thấy người dùng.');
  }
  return { userId, completedDonations: await repository.countCompletedByDonor(userId) };
};

// ---- Moves -----------------------------------------------------------------------------------

const decided = (actor: DonationActor) => ({
  decidedBy: new Types.ObjectId(actor.userId),
  decidedAt: new Date(),
});

const detailOf = async (record: DonationRecord, actor: DonationActor) =>
  toDetail(record, actor.isAdmin);

export const accept = async (actor: DonationActor, id: string) =>
  detailOf(
    await transition({ id, to: 'ACCEPTED', actor, allowed: canDecide, set: decided(actor) }),
    actor,
  );

export const reject = async (actor: DonationActor, id: string, reason: string) =>
  detailOf(
    await transition({
      id,
      to: 'REJECTED',
      actor,
      allowed: canDecide,
      set: { ...decided(actor), rejectReason: reason },
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
      to: 'CANCELLED',
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
      to: 'SHIPPING',
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
  body: ConfirmReceivedBody,
  options: { reason?: string | undefined } = {},
) => {
  assertOwnPhotos(actor, body.photos);
  return detailOf(
    await transition({
      id,
      to: 'COMPLETED',
      actor,
      allowed: canConfirmReceipt,
      // An Admin confirming for a USER receiver (who never confirmed) must give a reason.
      check: (record) => {
        if (actor.isAdmin && record.receiverType === 'USER' && !options.reason) {
          throw unprocessable(
            'REASON_REQUIRED',
            'Cần nhập lý do khi Admin xác nhận đã nhận thay người nhận.',
          );
        }
      },
      ...(options.reason ? { auditMeta: { adminReason: options.reason } } : {}),
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
