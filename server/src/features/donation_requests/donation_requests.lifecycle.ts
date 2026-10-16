import { Types } from 'mongoose';

import { writeAuditLog } from '../../infrastructure/database/audit.js';
import { withTransaction } from '../../infrastructure/database/schema-types.js';
import type { ActorReference } from '../../shared/contracts/actor.js';
import { assertTransition, donationTransitions } from '../../shared/domain/transitions.js';
import type { DonationStatus } from '../../shared/domain/statuses.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
} from '../../shared/events/domain-events.js';
import { toyMoveFor } from './donation_requests.policy.js';
import * as repository from './donation_requests.repository.js';
import { buildEvent } from './donation_requests.transition.js';

// Moves that no request party starts: the expiry job (R03 job 9) and the closing of the
// PENDING requests of a toy its owner hides or deletes (D-06). Each request moves in its own
// transaction with a conditional update, so a concurrent accept, handover or cancel wins or
// loses cleanly (the loser is skipped, never overwritten).

const DAY_MS = 24 * 60 * 60 * 1000;
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
  from: DonationStatus;
  to: 'CANCELLED' | 'REJECTED';
  actor: ActorReference;
  set: Record<string, unknown>;
  reason: string;
  auditAction?: `donation.${string}`;
  // For a toy that is already deleted.
  toyTitle?: string;
}

/** One conditional move; returns the event to publish, or undefined when it lost a race. */
const closeOne = async (command: CloseCommand): Promise<DonationStatusChangedEvent | undefined> =>
  withTransaction(async (session) => {
    const current = await repository.findRequestById(String(command.id), session);
    if (!current || current.status !== command.from) return undefined;
    assertTransition(donationTransitions, command.from, command.to);

    const toyMove = toyMoveFor(command.from, command.to);
    // The toy goes back to ACTIVE (ACCEPTED -> CANCELLED). A toy no longer RESERVED (should not
    // happen, GB-12) does not stop the request from closing.
    if (toyMove) await repository.moveToy(current.toyId, toyMove.from, toyMove.to, session);

    const next = await repository.updateRequestStatus(
      current._id,
      command.from,
      command.to,
      { set: command.set },
      session,
    );
    if (!next) return undefined;

    await repository.insertHistory(
      [
        {
          orderId: current._id,
          fromStatus: command.from,
          toStatus: command.to,
          actor: command.actor,
          reason: command.reason,
        },
      ],
      session,
    );
    if (command.auditAction) {
      await writeAuditLog(
        {
          ...command.actor,
          action: command.auditAction,
          target: { kind: 'DONATION_REQUEST', id: String(current._id) },
          meta: {
            before: { status: command.from },
            after: { status: command.to },
            reason: command.reason,
          },
        },
        session,
      );
    }
    const toyTitle =
      command.toyTitle ?? (await repository.findToy(current.toyId, session))?.title ?? '';
    return buildEvent(
      next,
      toyTitle,
      command.from,
      command.to,
      command.actor.actorId,
      command.reason,
    );
  });

const publishAll = (events: Array<DonationStatusChangedEvent | undefined>) => {
  for (const event of events) if (event) domainEvents.publish(event);
};

export interface ExpiryResult {
  expiredPending: number;
  expiredAccepted: number;
}

/**
 * R03 job 9 "Close donation requests not accepted in time" and UC Step 5.1_Expiration:
 * - PENDING for more than DONATION_PENDING_EXPIRY_DAYS (since created) -> CANCELLED (EXPIRED);
 * - ACCEPTED (not handed over) for more than DONATION_HANDOVER_EXPIRY_DAYS (since accepted)
 *   -> CANCELLED (EXPIRED), and the toy goes back from RESERVED to ACTIVE.
 * SHIPPING requests never expire (the toy may be on its way): the Admin resolves them.
 * Actor SYSTEM in the history and the audit log; DONATION_STATUS_CHANGED notifies both sides.
 */
export const expireStaleRequests = async (now: Date = new Date()): Promise<ExpiryResult> => {
  const [pendingDays, handoverDays] = await Promise.all([
    repository.getNumberSetting('DONATION_PENDING_EXPIRY_DAYS'),
    repository.getNumberSetting('DONATION_HANDOVER_EXPIRY_DAYS'),
  ]);
  const system: ActorReference = { actorType: 'SYSTEM' };
  const expire = async (
    from: 'PENDING' | 'ACCEPTED',
    days: number | undefined,
    reason: string,
  ): Promise<number> => {
    if (days === undefined || !(days > 0)) return 0;
    const before = new Date(now.getTime() - days * DAY_MS);
    const ids = await repository.findStaleRequestIds(
      from,
      from === 'PENDING' ? 'createdAt' : 'decidedAt',
      before,
      BATCH_LIMIT,
    );
    const events = [];
    for (const id of ids) {
      events.push(
        await closeOne({
          id,
          from,
          to: 'CANCELLED',
          actor: system,
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

  const expiredPending = await expire('PENDING', pendingDays, EXPIRED_PENDING_REASON);
  const expiredAccepted = await expire('ACCEPTED', handoverDays, EXPIRED_HANDOVER_REASON);
  return { expiredPending, expiredAccepted };
};

/**
 * D-06: the owner hid or deleted a DONATION toy (only possible without an ACCEPTED or SHIPPING
 * request, GB-12). Its PENDING requests are REJECTED with the reason, as decided by the owner,
 * and the requesters are notified.
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
        from: 'PENDING',
        to: 'REJECTED',
        actor: { actorType: 'USER', actorId: ownerId },
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
