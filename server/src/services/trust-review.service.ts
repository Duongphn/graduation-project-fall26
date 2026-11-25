import { Types } from 'mongoose';

import { TRUST_ATTEMPT_MERGE_MINUTES } from '../constants/trust-review.js';
import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import * as repository from '../repositories/trust-review.repository.js';
import type { RentalSettingsProvider } from '../interfaces/rental-order.ports.js';
import type { AdminContext } from '../utils/admin-context.js';
import { toIsoString } from '../utils/dates.js';
import { conflict, notFound } from '../utils/http-errors.js';
import { withTransaction } from '../utils/transaction.js';
import type {
  AccountTrustBlock,
  TrustDecisionBody,
  TrustDecisionResult,
  TrustLockBody,
} from '../validations/account-admin.validation.js';
import { isAdminLocked, lockAccountInSession, notifyLocked } from './account-lock.service.js';
import {
  sendNotices,
  trustBlockKeptNotice,
  trustBlockLiftedNotice,
} from './account-moderation.notices.js';
import { SystemSettingService } from './system-setting.service.js';
import {
  hasOpenReview,
  isBelowThreshold,
  isHeldBackByKeep,
  isLiftActive,
  trustScoreOf,
  type TrustFields,
  type TrustSettings,
} from './trust-review.rules.js';

// Renters blocked by a low Trust Score go to the Admin (BF-02 2a, UC29, FE-09), who lifts the
// block, keeps it or locks the account. Each decision closes the open review, writes an audit
// row and tells the Renter (ACCOUNT notification, also sent by email).

/** The threshold and the deposit limit come from the system settings (UC30) on every call. */
let settingsProvider: RentalSettingsProvider = new SystemSettingService();

/** Tests replace the settings source; null puts the system settings back. */
export const setTrustSettingsProvider = (provider: RentalSettingsProvider | null): void => {
  settingsProvider = provider ?? new SystemSettingService();
};

/**
 * Called by the booking check (UC06 step 4.1) when it refuses a Renter for a low score: records
 * the attempt on the Renter's review for the Admin. A failure here is logged and never changes
 * the refusal the Renter sees (MSG28).
 */
export const recordTrustBlock = async (input: {
  userId: string;
  trust: TrustFields | null | undefined;
  toy: { _id: Types.ObjectId; depositPrice?: number | null | undefined };
  settings: TrustSettings;
  now: Date;
}): Promise<boolean> => {
  const score = input.trust?.score;
  if (typeof score !== 'number' || isHeldBackByKeep(input.trust, score)) return false;
  try {
    return await repository.recordBlockedAttempt(
      input.userId,
      {
        toyId: input.toy._id,
        depositPrice: input.toy.depositPrice ?? 0,
        score,
        threshold: input.settings.minTrustScore,
        depositLimit: input.settings.trustDepositLimit,
        at: input.now,
      },
      new Date(input.now.getTime() - TRUST_ATTEMPT_MERGE_MINUTES * 60_000),
    );
  } catch (error) {
    console.error('[trust-review] Recording a blocked booking failed:', error);
    return false;
  }
};

// ---- Account detail ----

/** List badge: waiting for an Admin, or lifted and still holding. */
export const trustBlockStatusOf = (
  trust: TrustFields | null | undefined,
): 'review' | 'lifted' | null => {
  if (hasOpenReview(trust)) return 'review';
  return isLiftActive(trust) ? 'lifted' : null;
};

/** The Trust Score block of an account as the Admin sees it on User Detail (R03 screen 47). */
export const getTrustBlockView = async (
  trust: TrustFields | null | undefined,
  names: (ids: Types.ObjectId[]) => Promise<Map<string, string>>,
): Promise<AccountTrustBlock> => {
  const settings = await settingsProvider.getRentalSettings();
  const review = hasOpenReview(trust) ? trust?.review : undefined;
  const lift = isLiftActive(trust) ? trust?.lift : undefined;
  const decision = trust?.decision?.decidedAt ? trust.decision : undefined;
  const people = [lift?.liftedBy, decision?.decidedBy].filter(
    (id): id is Types.ObjectId => Boolean(id),
  );
  const [nameOf, toyTitle] = await Promise.all([
    names(people),
    repository.findToyTitle(review?.toyId),
  ]);
  const ref = (id: Types.ObjectId | undefined) =>
    id ? { id: String(id), fullName: nameOf.get(String(id)) ?? null } : null;
  return {
    threshold: settings.minTrustScore,
    depositLimit: settings.trustDepositLimit,
    blocked: isBelowThreshold(trust, settings) && !isLiftActive(trust),
    review:
      review?.requestedAt
        ? {
            requestedAt: review.requestedAt.toISOString(),
            lastBlockedAt: (review.lastBlockedAt ?? review.requestedAt).toISOString(),
            attemptCount: review.attemptCount ?? 1,
            toy: review.toyId ? { id: String(review.toyId), title: toyTitle } : null,
            depositPrice: review.depositPrice ?? 0,
            score: review.score ?? trustScoreOf(trust),
            threshold: review.threshold ?? settings.minTrustScore,
            depositLimit: review.depositLimit ?? settings.trustDepositLimit,
          }
        : null,
    lift:
      lift?.liftedAt && typeof lift.score === 'number'
        ? {
            liftedAt: lift.liftedAt.toISOString(),
            liftedBy: ref(lift.liftedBy),
            reason: lift.reason ?? '',
            score: lift.score,
          }
        : null,
    lastDecision:
      decision?.action && decision.decidedAt
        ? {
            action: decision.action,
            reason: decision.reason ?? '',
            decidedAt: decision.decidedAt.toISOString(),
            decidedBy: ref(decision.decidedBy),
            score: decision.score ?? trustScoreOf(trust),
          }
        : null,
  };
};

// ---- Admin decisions ----

const accountNotFound = () => notFound('USER_NOT_FOUND', 'Không tìm thấy tài khoản.');

const reviewNotOpen = () =>
  conflict('TRUST_REVIEW_NOT_OPEN', 'Tài khoản này không có yêu cầu xem xét Trust Score nào đang chờ.');

/** Another Admin decided first, or the review was closed meanwhile. */
const reviewChanged = () =>
  conflict(
    'TRUST_REVIEW_CHANGED',
    'Yêu cầu xem xét Trust Score vừa thay đổi. Vui lòng tải lại trang để xem trạng thái mới.',
  );

const loadTrust = async (id: string, session: Parameters<typeof repository.findTrustOf>[1]) => {
  const user = await repository.findTrustOf(id, session);
  if (!user) throw accountNotFound();
  return user;
};

const statusOf = (user: repository.TrustRecord, now: Date) => {
  const locked = isAdminLocked(user, now);
  return {
    accountStatus: locked ? ('LOCKED' as const) : ('ACTIVE' as const),
    lockedUntil: locked ? toIsoString(user.lock?.until) : null,
  };
};

const auditFacts = (trust: TrustFields | null | undefined, settings: TrustSettings) => ({
  score: trustScoreOf(trust),
  threshold: settings.minTrustScore,
  attempts: trust?.review?.attemptCount ?? 0,
});

/**
 * Lift the block (R03 screen 47): the Renter may book toys above the deposit limit while the
 * score stays at or above its current value. Allowed on an open review, or on a Renter whose
 * score is below the threshold (the Admin may lift before any refused attempt).
 */
export const liftTrustBlock = async (
  id: string,
  body: TrustDecisionBody,
  context: AdminContext,
): Promise<TrustDecisionResult> => {
  const settings = await settingsProvider.getRentalSettings();
  const now = new Date();
  const user = await withTransaction(async (session) => {
    const found = await loadTrust(id, session);
    if (!hasOpenReview(found.trust)) {
      if (isLiftActive(found.trust)) {
        throw conflict('TRUST_BLOCK_ALREADY_LIFTED', 'Chặn Trust Score của tài khoản này đã được gỡ.');
      }
      if (!isBelowThreshold(found.trust, settings)) {
        throw conflict('TRUST_BLOCK_NOT_APPLIED', 'Tài khoản này không bị chặn do Trust Score.');
      }
    }
    const written = await repository.writeDecision(
      found._id,
      found.trust?.review?.requestedAt ?? null,
      {
        action: 'lift',
        reason: body.reason,
        decidedAt: now,
        decidedBy: new Types.ObjectId(context.actor.actorId),
        score: trustScoreOf(found.trust),
        lift: true,
      },
      session,
    );
    if (!written) throw reviewChanged();
    await writeAuditLog(
      adminAuditEntry(context, 'user.trust_lift', { kind: 'USER', id }, {
        reason: body.reason,
        ...auditFacts(found.trust, settings),
      }),
      session,
    );
    return found;
  });
  const toyId = user.trust?.review?.toyId;
  sendNotices([
    trustBlockLiftedNotice(id, trustScoreOf(user.trust), body.reason, toyId ? String(toyId) : undefined),
  ]);
  return { id, decision: 'lift', ...statusOf(user, now) };
};

/**
 * Keep the block: closes the open review and the Renter stays blocked. On a Renter whose block
 * was lifted (no open review), it puts the block back. A later refused attempt opens a new review
 * only once the score has changed (isHeldBackByKeep).
 */
export const keepTrustBlock = async (
  id: string,
  body: TrustDecisionBody,
  context: AdminContext,
): Promise<TrustDecisionResult> => {
  const settings = await settingsProvider.getRentalSettings();
  const now = new Date();
  const { user, liftRevoked } = await withTransaction(async (session) => {
    const found = await loadTrust(id, session);
    const open = hasOpenReview(found.trust);
    const lifted = isLiftActive(found.trust);
    if (!open && !lifted) {
      throw conflict(
        'TRUST_REVIEW_NOT_OPEN',
        'Tài khoản này không có yêu cầu xem xét hay lệnh gỡ chặn Trust Score nào để giữ chặn.',
      );
    }
    const written = await repository.writeDecision(
      found._id,
      found.trust?.review?.requestedAt ?? null,
      {
        action: 'keep',
        reason: body.reason,
        decidedAt: now,
        decidedBy: new Types.ObjectId(context.actor.actorId),
        score: trustScoreOf(found.trust),
      },
      session,
    );
    if (!written) throw reviewChanged();
    await writeAuditLog(
      adminAuditEntry(context, 'user.trust_keep', { kind: 'USER', id }, {
        reason: body.reason,
        ...auditFacts(found.trust, settings),
        ...(!open ? { liftRevoked: true } : {}),
      }),
      session,
    );
    return { user: found, liftRevoked: !open };
  });
  sendNotices([
    trustBlockKeptNotice(id, {
      threshold: settings.minTrustScore,
      depositLimit: settings.trustDepositLimit,
      reason: body.reason,
      liftRevoked,
    }),
  ]);
  return { id, decision: 'keep', ...statusOf(user, now) };
};

/**
 * Lock the account from an open review: the usual lock (7 days, 30 days or permanent, GB-05),
 * which writes its own "user.lock" audit row and notice, and the review is closed.
 */
export const lockForTrustReview = async (
  id: string,
  body: TrustLockBody,
  context: AdminContext,
): Promise<TrustDecisionResult> => {
  const settings = await settingsProvider.getRentalSettings();
  const lock = await withTransaction(async (session) => {
    const found = await loadTrust(id, session);
    if (!hasOpenReview(found.trust)) throw reviewNotOpen();
    const result = await lockAccountInSession(
      id,
      { duration: body.duration, reason: body.reason },
      context,
      session,
    );
    const written = await repository.writeDecision(
      found._id,
      found.trust?.review?.requestedAt ?? null,
      {
        action: 'lock',
        reason: body.reason,
        decidedAt: new Date(),
        decidedBy: new Types.ObjectId(context.actor.actorId),
        score: trustScoreOf(found.trust),
      },
      session,
    );
    if (!written) throw reviewChanged();
    await writeAuditLog(
      adminAuditEntry(context, 'user.trust_lock', { kind: 'USER', id }, {
        reason: body.reason,
        duration: body.duration,
        ...auditFacts(found.trust, settings),
      }),
      session,
    );
    return result;
  });
  notifyLocked(lock, body.duration, body.reason);
  return { id, decision: 'lock', accountStatus: 'LOCKED', lockedUntil: toIsoString(lock.until) };
};
