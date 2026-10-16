import { Types } from 'mongoose';

import { adminAuditEntry, writeAuditLog } from '../../infrastructure/database/audit.js';
import { withTransaction } from '../../infrastructure/database/schema-types.js';
import type { ActorReference } from '../../shared/contracts/actor.js';
import {
  assertTransition,
  donationTransitions,
  toyTransitions,
} from '../../shared/domain/transitions.js';
import type { DonationStatus } from '../../shared/domain/statuses.js';
import { conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
} from '../../shared/events/domain-events.js';
import { isDuplicateKeyError } from '../../shared/utils/mongo-errors.js';
import {
  auditActionFor,
  canView,
  SIBLING_REJECT_REASON,
  toyMoveFor,
  type DonationActor,
} from './donation_requests.policy.js';
import * as repository from './donation_requests.repository.js';
import type { DonationRecord } from './donation_requests.repository.js';

// The ONE path for every status move of a donation request:
// read -> permission -> assertTransition -> conditional update -> toy move -> sibling rejects
// -> status history -> audit (Admin) -> commit -> DONATION_STATUS_CHANGED events.

export const requestNotFound = () =>
  notFound('DONATION_REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu nhận tặng.');

export const toyNotAvailable = () =>
  conflict('TOY_NOT_AVAILABLE', 'Đồ chơi không còn sẵn sàng để tặng.');

export const organizationNotAvailable = () =>
  conflict('ORGANIZATION_NOT_AVAILABLE', 'Tổ chức nhận tặng không còn hoạt động.');

/** The audit context of an Admin actor (DonationActor carries the same facts). */
export const adminContextOf = (actor: DonationActor) => ({
  actor: { actorType: 'ADMIN' as const, actorId: actor.userId },
  ...(actor.ipAddress ? { ipAddress: actor.ipAddress } : {}),
});

export const actorReference = (actor: DonationActor): ActorReference & { actorId: string } => ({
  actorType: actor.isAdmin ? 'ADMIN' : 'USER',
  actorId: actor.userId,
});

export interface TransitionCommand {
  id: string;
  to: DonationStatus;
  actor: DonationActor;
  allowed: (record: DonationRecord, actor: DonationActor) => boolean;
  // Statuses this actor may move from (narrower than donationTransitions), e.g. users cannot
  // cancel a SHIPPING request.
  allowedFrom?: readonly DonationStatus[];
  // Extra check on the current request, inside the transaction (e.g. a required reason).
  check?: (record: DonationRecord) => void;
  // Extra audit meta (Admin moves).
  auditMeta?: Record<string, unknown>;
  set?: Record<string, unknown>;
  pushHandover?: Record<string, unknown>;
  // Saved in the status history (reject reason, cancel note).
  reason?: string;
}

export const buildEvent = (
  record: DonationRecord,
  toyTitle: string,
  from: DonationStatus,
  to: DonationStatus,
  changedBy: string | undefined,
  reason?: string,
): DonationStatusChangedEvent => ({
  type: 'DONATION_STATUS_CHANGED',
  donationRequestId: String(record._id),
  toyId: String(record.toyId),
  toyTitle,
  donorId: String(record.donorId),
  requestedBy: String(record.requestedBy),
  receiverType: record.receiverType,
  ...(record.organizationId ? { organizationId: String(record.organizationId) } : {}),
  from,
  to,
  ...(reason ? { reason } : {}),
  ...(changedBy ? { changedBy } : {}),
});

export const transition = async (command: TransitionCommand): Promise<DonationRecord> => {
  const { actor, to } = command;
  const actorRef = actorReference(actor);

  const { updated, events } = await withTransaction(async (session) => {
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
    command.check?.(current);

    const toy = await repository.findToy(current.toyId, session);
    if (!toy) throw toyNotAvailable();

    if (to === 'ACCEPTED' && current.organizationId) {
      // A write, so a concurrent hide of the organization write-conflicts with the accept.
      if (!(await repository.touchActiveOrganization(current.organizationId, session))) {
        throw organizationNotAvailable();
      }
    }

    const toyMove = toyMoveFor(from, to);
    if (toyMove) {
      assertTransition(toyTransitions, toyMove.from, toyMove.to);
      if (!(await repository.moveToy(current.toyId, toyMove.from, toyMove.to, session))) {
        throw toyNotAvailable();
      }
    }

    const changes = {
      ...(command.set ? { set: command.set } : {}),
      ...(command.pushHandover ? { pushHandover: command.pushHandover } : {}),
    };
    const next = await repository.updateRequestStatus(current._id, from, to, changes, session);
    if (!next) {
      throw conflict('DONATION_REQUEST_CHANGED', 'Yêu cầu vừa được cập nhật, vui lòng tải lại.');
    }

    const siblings =
      to === 'ACCEPTED'
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

    await repository.insertHistory(
      [
        {
          orderId: current._id,
          fromStatus: from,
          toStatus: to,
          actor: actorRef,
          ...(command.reason ? { reason: command.reason } : {}),
        },
        ...siblings.map((sibling) => ({
          orderId: sibling._id,
          fromStatus: 'PENDING' as const,
          toStatus: 'REJECTED' as const,
          actor: actorRef,
          reason: SIBLING_REJECT_REASON,
        })),
      ],
      session,
    );

    if (actor.isAdmin) {
      await writeAuditLog(
        adminAuditEntry(
          adminContextOf(actor),
          auditActionFor(to),
          { kind: 'DONATION_REQUEST', id: String(current._id) },
          {
            before: { status: from },
            after: { status: to },
            ...(command.reason ? { reason: command.reason } : {}),
            ...(siblings.length > 0
              ? { rejectedSiblings: siblings.map((sibling) => String(sibling._id)) }
              : {}),
            ...command.auditMeta,
          },
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
            'PENDING',
            'REJECTED',
            actor.userId,
            SIBLING_REJECT_REASON,
          ),
        ),
      ],
    };
  }).catch((error: unknown) => {
    // Another request of the toy was accepted at the same time (one_accepted_per_toy).
    if (isDuplicateKeyError(error, 'one_accepted_per_toy')) throw toyNotAvailable();
    throw error;
  });

  for (const event of events) domainEvents.publish(event);
  return updated;
};
