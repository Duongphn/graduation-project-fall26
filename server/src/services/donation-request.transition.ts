import { Types, type ClientSession } from 'mongoose';

import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import { conflict, forbidden, notFound } from '../utils/http-errors.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
} from '../utils/domain-events.js';
import { assertTransition } from '../utils/transitions.js';
import type { StoredDonationStatus } from '../models/donation-request.model.js';
import {
  auditActionFor,
  canView,
  receiverTypeOf,
  SIBLING_REJECT_REASON,
  toyMoveFor,
  type DonationActor,
} from './donation-request.policy.js';
import * as repository from '../repositories/donation-request.repository.js';
import type { DonationRecord } from '../repositories/donation-request.repository.js';
import { donationTransitions } from '../constants/donation-request-transitions.js';
import { SystemSettingService } from './system-setting.service.js';

// The ONE path for every status move of a donation request:
// read -> permission -> assertTransition -> conditional update -> toy move -> sibling rejects
// -> audit (Admin) -> commit -> DONATION_STATUS_CHANGED events.

/** GB-57 time limits from the System Settings (UC30), read on every use. */
export const donationSettings = () => new SystemSettingService().getDonationSettings();

export const requestNotFound = () =>
  notFound('DONATION_REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu nhận tặng.');

export const toyNotAvailable = () =>
  conflict('TOY_NOT_AVAILABLE', 'Đồ chơi không còn sẵn sàng để tặng.');

export const organizationNotAvailable = () =>
  conflict('ORGANIZATION_NOT_AVAILABLE', 'Tổ chức nhận tặng không còn hoạt động.');

/** GB-55, MSG51: the organization is active but not taking toys now. */
export const organizationNotAccepting = () =>
  conflict(
    'ORGANIZATION_NOT_ACCEPTING',
    'Tổ chức này hiện không nhận đồ chơi. Vui lòng chọn tổ chức khác.',
  );

/**
 * GB-51: an organization receives toys through its receiving point. One saved before receiving
 * points existed has none until the Admin enters it, so it takes no new request, no accept and
 * no handover.
 */
export const organizationWithoutPoint = () =>
  conflict(
    'ORGANIZATION_NO_RECEIVING_POINT',
    'Tổ chức chưa có điểm nhận đồ chơi nên chưa nhận quyên góp. Vui lòng chọn tổ chức khác.',
  );

/** The audit context of an Admin actor (DonationActor carries the same facts). */
export const adminContextOf = (actor: DonationActor) => ({
  actor: { actorType: 'ADMIN' as const, actorId: actor.userId },
  ...(actor.ipAddress ? { ipAddress: actor.ipAddress } : {}),
});

export interface TransitionCommand {
  id: string;
  to: StoredDonationStatus;
  actor: DonationActor;
  allowed: (record: DonationRecord, actor: DonationActor) => boolean;
  // Statuses this actor may move from (narrower than donationTransitions).
  allowedFrom?: readonly StoredDonationStatus[];
  // Extra check on the current request, inside the transaction (e.g. a required reason).
  check?: (record: DonationRecord, session: ClientSession) => void | Promise<void>;
  // Fields to set; a function gets the current request (e.g. fields that depend on the receiver).
  set?: Record<string, unknown> | ((record: DonationRecord) => Record<string, unknown>);
  unset?: string[];
  pushHandover?: Record<string, unknown>;
  // Carried by the event (reject reason, cancel note).
  reason?: string;
}

export const buildEvent = (
  record: DonationRecord,
  toyTitle: string,
  from: StoredDonationStatus | undefined,
  to: StoredDonationStatus,
  changedBy: string | undefined,
  reason?: string,
): DonationStatusChangedEvent => ({
  type: 'DONATION_STATUS_CHANGED',
  donationRequestId: String(record._id),
  ...(record.code ? { code: record.code } : {}),
  toyId: String(record.toyId),
  toyTitle,
  donorId: String(record.donorId),
  requestedBy: String(record.requestedBy),
  receiverType: receiverTypeOf(record),
  ...(record.receiver?.organizationId
    ? { organizationId: String(record.receiver.organizationId) }
    : {}),
  ...(from ? { from } : {}),
  to,
  ...(reason ? { reason } : {}),
  ...(changedBy ? { changedBy } : {}),
  // MSG54 names the handover deadline, MSG55 the received date (the Admin's date for an
  // organization, else the confirmation time).
  ...(to === 'accepted' && record.timer?.dueAt
    ? { handoverDueAt: record.timer.dueAt.toISOString() }
    : {}),
  ...(to === 'completed' && (record.receivedAt ?? record.completedAt)
    ? { receivedAt: (record.receivedAt ?? record.completedAt)!.toISOString() }
    : {}),
});

export const transition = async (command: TransitionCommand): Promise<DonationRecord> => {
  const { actor, to } = command;

  const { updated, events } = await repository.withTransaction(async (session) => {
    const current = await repository.findRequestById(command.id, session);
    if (!current || !canView(current, actor)) throw requestNotFound();
    if (!command.allowed(current, actor)) throw forbidden();
    const from = current.status;
    assertTransition(donationTransitions, from, to);
    if (command.allowedFrom && !command.allowedFrom.includes(from)) {
      throw conflict('INVALID_STATUS_TRANSITION', `Status cannot change from ${from} to ${to}.`, {
        from,
        to,
      });
    }
    await command.check?.(current, session);

    const toy = await repository.findToy(current.toyId, session);
    if (!toy) throw toyNotAvailable();

    if (to === 'accepted' && current.receiver?.organizationId) {
      // A write, so a concurrent hide of the organization write-conflicts with the accept.
      const organization = await repository.touchActiveOrganization(
        current.receiver.organizationId,
        session,
      );
      if (!organization) throw organizationNotAvailable();
      // GB-51: the toy goes to the receiving point; an older organization has none yet.
      if (!organization.receivingPoint) throw organizationWithoutPoint();
    }

    // The conditional toy move also guarantees one accepted request per toy.
    const toyMove = toyMoveFor(from, to);
    if (toyMove) {
      if (!(await repository.moveToy(current.toyId, toyMove.from, toyMove.to, session))) {
        throw toyNotAvailable();
      }
    }

    const set = typeof command.set === 'function' ? command.set(current) : command.set;
    const next = await repository.updateRequestStatus(
      current._id,
      from,
      to,
      {
        ...(set ? { set } : {}),
        ...(command.unset ? { unset: command.unset } : {}),
        ...(command.pushHandover ? { pushHandover: command.pushHandover } : {}),
      },
      session,
    );
    if (!next) {
      throw conflict('DONATION_REQUEST_CHANGED', 'Yêu cầu vừa được cập nhật, vui lòng tải lại.');
    }

    const siblings =
      to === 'accepted'
        ? await repository.rejectPendingSiblings(
            current.toyId,
            current._id,
            {
              decidedBy: new Types.ObjectId(actor.userId),
              decidedAt: new Date(),
              rejectReason: SIBLING_REJECT_REASON,
            },
            session,
          )
        : [];

    if (actor.isAdmin) {
      await writeAuditLog(
        adminAuditEntry(
          adminContextOf(actor),
          auditActionFor(to),
          { kind: 'DONATION_REQUEST', id: String(current._id) },
          { from, to },
        ),
        session,
      );
    }

    return {
      updated: next,
      events: [
        buildEvent(next, toy.title, from, to, actor.userId, command.reason),
        ...siblings.map((sibling) =>
          buildEvent(
            sibling,
            toy.title,
            'pending',
            'rejected',
            actor.userId,
            SIBLING_REJECT_REASON,
          ),
        ),
      ],
    };
  });

  for (const event of events) domainEvents.publish(event);
  return updated;
};
