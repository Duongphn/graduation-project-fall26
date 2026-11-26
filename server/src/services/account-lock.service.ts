import { Types, type ClientSession } from 'mongoose';

import { LOCK_DURATION_DAYS, type LockDuration } from '../constants/violation-report.js';
import type { IUser } from '../models/user.model.js';
import * as repository from '../repositories/account-admin.repository.js';
import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import type { AdminContext } from '../utils/admin-context.js';
import { AppError } from '../utils/app-error.js';
import { conflict, notFound, unprocessable } from '../utils/http-errors.js';
import {
  accountLockedNotice,
  accountUnlockedNotice,
  formatVietnamTime,
  sendNotices,
} from './account-moderation.notices.js';

// Admin account locks (UC29, GB-05). A lock: sets the account Locked with a reason (and an end
// date for 7 or 30 days), hides the user's Active listings, ends every session (refresh tokens)
// and freezes wallet withdrawals. Orders already running continue, and money held in escrow
// stays where it is. An unlock shows the hidden listings again.

interface LockFields {
  status: IUser['status'] | string;
  lock?: { until?: Date | undefined; reason?: string | undefined } | undefined;
}

/** True while an Admin lock runs: a permanent lock, or a timed lock not yet ended. */
export const isAdminLocked = (user: LockFields, now: Date = new Date()): boolean =>
  user.status === 'LOCKED' && (!user.lock?.until || user.lock.until > now);

/** MSG12: "Your account is locked. Reason: {reason}." (with the end date of a timed lock). */
export const lockedAccountMessage = (user: LockFields): string => {
  const until = user.lock?.until ? ` đến ${formatVietnamTime(user.lock.until)}` : '';
  const reason = user.lock?.reason?.trim();
  return `Tài khoản của bạn đã bị khóa${until}.${reason ? ` Lý do: ${reason}` : ''}`;
};

/** The error of a request or sign-in by a locked account (code kept from develop's auth). */
export const accountLockedError = (user: LockFields, status: 401 | 403 = 403): AppError =>
  new AppError(status, 'USER_INACTIVE', lockedAccountMessage(user), {
    lockedUntil: user.lock?.until?.toISOString() ?? null,
  });

const lockEnd = (duration: LockDuration, now: Date): Date | undefined =>
  duration === 'permanent'
    ? undefined
    : new Date(now.getTime() + LOCK_DURATION_DAYS[duration] * 24 * 60 * 60 * 1000);

const accountNotFound = () => notFound('USER_NOT_FOUND', 'Không tìm thấy tài khoản.');

export interface LockResult {
  userId: string;
  until: Date | null;
  hiddenToyIds: Types.ObjectId[];
}

/**
 * Locks an account inside the caller's transaction and writes the audit entry. The notice is
 * sent by the caller after the commit (notifyLocked).
 */
export const lockAccountInSession = async (
  userId: string,
  input: { duration: LockDuration; reason: string; reportId?: string },
  context: AdminContext,
  session: ClientSession,
): Promise<LockResult> => {
  const now = new Date();
  const user = await repository.findAccountById(userId, session);
  if (!user) throw accountNotFound();
  if (user.role === 'ADMIN') {
    throw unprocessable('CANNOT_LOCK_ADMIN', 'Không thể khóa tài khoản Admin.');
  }
  if (isAdminLocked(user, now)) {
    throw conflict('ACCOUNT_ALREADY_LOCKED', 'Tài khoản này đang bị khóa.', {
      lockedUntil: user.lock?.until?.toISOString() ?? null,
    });
  }

  const hiddenToyIds = await repository.hideActiveToysOf(user._id, session);
  const until = lockEnd(input.duration, now);
  const locked = await repository.setAdminLock(
    user._id,
    {
      ...(until ? { until } : {}),
      reason: input.reason,
      lockedAt: now,
      lockedBy: new Types.ObjectId(context.actor.actorId),
      hiddenToyIds,
    },
    now,
    session,
  );
  if (!locked) throw conflict('ACCOUNT_ALREADY_LOCKED', 'Tài khoản này đang bị khóa.');
  await repository.revokeSessions(user._id, session);

  await writeAuditLog(
    adminAuditEntry(
      context,
      'user.lock',
      { kind: 'USER', id: userId },
      {
        duration: input.duration,
        until: until?.toISOString() ?? null,
        reason: input.reason,
        hiddenListings: hiddenToyIds.length,
        ...(input.reportId ? { reportId: input.reportId } : {}),
      },
    ),
    session,
  );
  return { userId, until: until ?? null, hiddenToyIds };
};

// Closes the open Socket.IO connections (chat, notifications) of a user. server.ts sets it once
// the socket server is up; without it (tests, jobs run alone) there is nothing to close.
let closeOpenConnections: ((userId: string) => void) | undefined;

export const setOpenConnectionCloser = (closer: ((userId: string) => void) | undefined): void => {
  closeOpenConnections = closer;
};

/**
 * After the commit: the lock ends the current session (R03 III.7.2.1 (10)). The refresh tokens
 * went with the lock; the open Socket.IO connections are closed here, then the user is told.
 */
export const notifyLocked = (result: LockResult, duration: LockDuration, reason: string): void => {
  try {
    closeOpenConnections?.(result.userId);
  } catch (error) {
    console.error('[accounts] Closing the connections of a locked account failed:', error);
  }
  sendNotices([accountLockedNotice(result.userId, duration, result.until, reason)]);
};

export interface UnlockResult {
  userId: string;
  restored: number;
}

/**
 * Ends an Admin lock and shows the listings it hid again. `context` is null for the end of a
 * timed lock (system), which only applies when the lock has run out.
 */
export const unlockAccountInSession = async (
  userId: string,
  reason: string | undefined,
  context: AdminContext | null,
  session: ClientSession,
): Promise<UnlockResult> => {
  const now = new Date();
  const user = await repository.findAccountById(userId, session);
  if (!user) throw accountNotFound();
  if (user.status !== 'LOCKED') {
    throw conflict('ACCOUNT_NOT_LOCKED', 'Tài khoản này không bị khóa.');
  }
  const before = await repository.clearAdminLock(
    user._id,
    session,
    context ? {} : { expiredBefore: now },
  );
  if (!before) throw conflict('ACCOUNT_NOT_LOCKED', 'Tài khoản này không bị khóa.');
  const restored = await repository.restoreToys(before.lock?.hiddenToyIds ?? [], session);

  const details = { ...(reason ? { reason } : {}), restoredListings: restored };
  await writeAuditLog(
    context
      ? adminAuditEntry(context, 'user.unlock', { kind: 'USER', id: userId }, details)
      : { action: 'user.unlock', target: { kind: 'USER', id: userId }, details: { ...details, expired: true } },
    session,
  );
  return { userId, restored };
};

export const notifyUnlocked = (result: UnlockResult, reason: string | undefined): void =>
  sendNotices([accountUnlockedNotice(result.userId, reason)]);

/**
 * Ends one timed lock that has run out (system action). False when there was nothing to end, for
 * example when an Admin unlocked it first.
 */
export const releaseExpiredLock = async (userId: string): Promise<boolean> => {
  try {
    const result = await repository.withTransaction((session) =>
      unlockAccountInSession(userId, undefined, null, session),
    );
    notifyUnlocked(result, undefined);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.code === 'ACCOUNT_NOT_LOCKED') return false;
    throw error;
  }
};

/** The job: ends every timed lock that has run out. */
export const releaseExpiredLocks = async (now: Date = new Date()) => {
  const ids = await repository.findExpiredLockIds(now);
  let released = 0;
  for (const id of ids) {
    if (await releaseExpiredLock(String(id))) released += 1;
  }
  return { found: ids.length, released };
};

/**
 * Hook for sign-in (auth): refuses an account under a running Admin lock with MSG12 and its
 * reason. A timed lock that has run out lets the user in; the job then ends it.
 */
export const assertNotAdminLocked = (user: LockFields): void => {
  if (isAdminLocked(user)) throw accountLockedError(user);
};

/** Hook for `authenticate` and the socket handshake: the running Admin lock of a user, or null. */
export const findRunningLock = async (userId: string): Promise<LockFields | null> => {
  const user = await repository.findLockOf(userId);
  return user && isAdminLocked(user) ? user : null;
};

/**
 * Hook for the wallet (withdrawal request and payout): a locked account's wallet is frozen.
 * Settlements and refunds still reach it (GB-05); only money leaving it is refused.
 */
export const assertWalletNotFrozen = async (userId: string): Promise<void> => {
  const lock = await findRunningLock(userId);
  if (lock) {
    throw new AppError(403, 'WALLET_FROZEN', 'Ví đang bị đóng băng vì tài khoản bị khóa.');
  }
};
