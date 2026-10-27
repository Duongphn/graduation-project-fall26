import { Types } from 'mongoose';

import { writeAuditLog } from '../repositories/audit-log.repository.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
} from '../utils/domain-events.js';
import { assertTransition } from '../utils/transitions.js';
import type { StoredDonationStatus } from '../models/donation-request.model.js';
import { toyMoveFor } from './donation-request.policy.js';
import * as repository from '../repositories/donation-request.repository.js';
import { donationTransitions } from '../constants/donation-request-transitions.js';
import { buildEvent } from './donation-request.transition.js';

// Moves that no request party starts: the expiry job (R03 job 9) and the closing of the
// pending requests of a toy its owner hides or deletes (D-06). Each request moves in its own
// transaction with a conditional update, so a concurrent accept, handover or cancel wins or
// loses cleanly (the loser is skipped, never overwritten).

const BATCH_LIMIT = 500;

export const EXPIRED_PENDING_REASON = 'Yêu cầu đã hết hạn vì không được chấp nhận kịp thời.';
export const EXPIRED_HANDOVER_REASON =
  'Yêu cầu đã hết hạn vì người quyên góp chưa gửi đồ chơi kịp thời.';
export const TOY_WITHDRAWN_REASON = {
  HIDDEN: 'Người quyên góp đã ẩn đồ chơi này.',
  DELETED: 'Người quyên góp đã xóa đồ chơi này.',
} as const;

interface CloseCommand {
  id: Types.ObjectId;
  from: StoredDonationStatus;
  to: 'cancelled' | 'rejected';
  // The user who closes it; absent for the system (expiry job).
  actorId?: string;
  set: Record<string, unknown>;
  reason: string;
  auditAction?: `donation.${string}`;
  // For a toy that is already deleted.
  toyTitle?: string;
}

/** One conditional move; returns the event to publish, or undefined when it lost a race. */
const closeOne = async (command: CloseCommand): Promise<DonationStatusChangedEvent | undefined> =>
  repository.withTransaction(async (session) => {
    const current = await repository.findRequestById(String(command.id), session);
    if (!current || current.status !== command.from) return undefined;
    assertTransition(donationTransitions, command.from, command.to);

    const toyMove = toyMoveFor(command.from, command.to);
    // The toy goes back to active (accepted -> cancelled). A toy no longer hidden does not stop
    // the request from closing.
    if (toyMove) await repository.moveToy(current.toyId, toyMove.from, toyMove.to, session);

    const next = await repository.updateRequestStatus(
      current._id,
      command.from,
      command.to,
      { set: command.set, unset: ['timer'] },
      session,
    );
    if (!next) return undefined;

    if (command.auditAction) {
      await writeAuditLog(
        {
          ...(command.actorId ? { actorId: command.actorId } : {}),
          action: command.auditAction,
          target: { kind: 'DONATION_REQUEST', id: String(current._id) },
        },
        session,
      );
    }
    const toyTitle =
      command.toyTitle ?? (await repository.findToy(current.toyId, session))?.title ?? '';
    return buildEvent(next, toyTitle, command.from, command.to, command.actorId, command.reason);
  });

const publishAll = (events: Array<DonationStatusChangedEvent | undefined>) => {
  for (const event of events) if (event) domainEvents.publish(event);
};

export interface ExpiryResult {
  expiredPending: number;
  expiredAccepted: number;
}

/**
 * R03 job 9 "Close donation requests not accepted in time": a pending or accepted request
 * whose timer.dueAt has passed is cancelled (reason EXPIRED); an accepted toy goes back to
 * active. The deadline is set when the request is created (PENDING_EXPIRY_DAYS) and again when
 * it is accepted (HANDOVER_EXPIRY_DAYS); shipping requests have no timer (the Admin resolves
 * them).
 */
export const expireStaleRequests = async (now: Date = new Date()): Promise<ExpiryResult> => {
  const expire = async (from: 'pending' | 'accepted', reason: string): Promise<number> => {
    const ids = await repository.findDueRequestIds(from, now, BATCH_LIMIT);
    const events = [];
    for (const id of ids) {
      events.push(
        await closeOne({
          id,
          from,
          to: 'cancelled',
          set: {
            cancellation: { reason: 'EXPIRED', actorType: 'SYSTEM', note: reason, at: now },
          },
          reason,
          auditAction: 'donation.expire',
        }),
      );
    }
    publishAll(events);
    return events.filter(Boolean).length;
  };

  const expiredPending = await expire('pending', EXPIRED_PENDING_REASON);
  const expiredAccepted = await expire('accepted', EXPIRED_HANDOVER_REASON);
  return { expiredPending, expiredAccepted };
};

/**
 * D-06: the owner hid or deleted a donation toy (only possible without an accepted or shipping
 * request). Its pending requests are rejected with the reason, as decided by the owner, and the
 * requesters are notified.
 */
export const closePendingRequestsForToy = async (
  toyId: string,
  ownerId: string,
  why: keyof typeof TOY_WITHDRAWN_REASON,
  toyTitle?: string,
): Promise<number> => {
  if (!Types.ObjectId.isValid(toyId) || !Types.ObjectId.isValid(ownerId)) return 0;
  const ids = await repository.findPendingRequestIdsOfToy(toyId);
  const reason = TOY_WITHDRAWN_REASON[why];
  const events = [];
  for (const id of ids) {
    events.push(
      await closeOne({
        id,
        from: 'pending',
        to: 'rejected',
        actorId: ownerId,
        set: {
          decidedBy: new Types.ObjectId(ownerId),
          decidedAt: new Date(),
          rejectReason: reason,
        },
        reason,
        ...(toyTitle !== undefined ? { toyTitle } : {}),
      }),
    );
  }
  publishAll(events);
  return events.filter(Boolean).length;
};

export const hasActiveRequestForToy = repository.hasActiveRequestForToy;
