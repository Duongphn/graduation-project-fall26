import type { Types } from 'mongoose';

import * as repository from '../repositories/account-admin.repository.js';
import type { AdminContext } from '../utils/admin-context.js';
import { toIsoString } from '../utils/dates.js';
import { notFound } from '../utils/http-errors.js';
import { maskPhone } from '../utils/phone.js';
import { maskEmail } from '../utils/privacy.js';
import { toMongoPaging } from '../utils/response.js';
import {
  accountListTabs,
  accountSortFields,
  type AccountActionResult,
  type AccountCounts,
  type AccountCountsQuery,
  type AccountDetail,
  type AccountListItem,
  type AccountListQuery,
  type LockAccountBody,
  type UnlockAccountBody,
} from '../validations/account-admin.validation.js';
import {
  isAdminLocked,
  lockAccountInSession,
  notifyLocked,
  notifyUnlocked,
  unlockAccountInSession,
} from './account-lock.service.js';

// Admin account management (UC29, R03 III.7.2.1): accounts with their violation count, lock
// and unlock with a reason. Phones and emails are masked in the list (GB-35).

const toListItem = (
  row: repository.AccountRecord & { violationCount: number; pendingReportCount: number },
  now: Date,
): AccountListItem => {
  const locked = isAdminLocked(row, now);
  return {
    id: String(row._id),
    fullName: row.fullName,
    avatar: row.avatar ?? null,
    maskedPhone: maskPhone(row.phone),
    maskedEmail: maskEmail(row.email),
    role: row.role,
    accountStatus: locked ? 'LOCKED' : 'ACTIVE',
    lockedUntil: locked ? toIsoString(row.lock?.until) : null,
    verificationStatus: row.verificationStatus,
    trustScore: row.trust?.score ?? repository.STARTING_TRUST_SCORE,
    violationCount: row.violationCount,
    pendingReportCount: row.pendingReportCount,
    createdAt: row.createdAt.toISOString(),
  };
};

export const listAccounts = async (
  query: AccountListQuery,
): Promise<{ items: AccountListItem[]; totalItems: number }> => {
  const now = new Date();
  const paging = toMongoPaging(query, accountSortFields);
  const { rows, total } = await repository.listAccounts(
    query.tab,
    { role: query.role, trustBand: query.trustBand, q: query.q || undefined },
    paging,
    now,
  );
  return { items: rows.map((row) => toListItem(row, now)), totalItems: total };
};

/** Counters of the status tabs (All, Active, Locked, New reports). */
export const countAccounts = async (query: AccountCountsQuery): Promise<AccountCounts> => {
  const now = new Date();
  const filter = { role: query.role, trustBand: query.trustBand, q: query.q || undefined };
  const counts = await Promise.all(
    accountListTabs.map((tab) => repository.countAccounts(tab, filter, now)),
  );
  return Object.fromEntries(accountListTabs.map((tab, index) => [tab, counts[index]])) as AccountCounts;
};

const accountNotFound = () => notFound('USER_NOT_FOUND', 'Không tìm thấy tài khoản.');

export const getAccountDetail = async (id: string): Promise<AccountDetail> => {
  const now = new Date();
  const user = await repository.findAccountById(id);
  if (!user) throw accountNotFound();
  const [counts, activeListingCount, violations, lockerNames] = await Promise.all([
    repository.countReportsAgainst(user._id),
    repository.countActiveToysOf(user._id),
    repository.findResolvedReportsAgainst(user._id),
    repository.findUserNames(user.lock?.lockedBy ? [user.lock.lockedBy as Types.ObjectId] : []),
  ]);
  const locked = isAdminLocked(user, now);
  const lockedBy = user.lock?.lockedBy;
  return {
    ...toListItem({ ...user, ...counts }, now),
    phone: user.phone,
    email: user.email,
    lock: locked
      ? {
          reason: user.lock?.reason ?? null,
          lockedAt: toIsoString(user.lock?.lockedAt),
          lockedBy: lockedBy
            ? { id: String(lockedBy), fullName: lockerNames.get(String(lockedBy)) ?? null }
            : null,
          until: toIsoString(user.lock?.until),
          hiddenListingCount: user.lock?.hiddenToyIds?.length ?? 0,
        }
      : null,
    activeListingCount,
    violations: violations.map((report) => ({
      reportId: String(report._id),
      reason: report.reason,
      targetKind: report.target.kind,
      action: report.resolution?.action ?? null,
      note: report.resolution?.note ?? null,
      resolvedAt: toIsoString(report.resolution?.resolvedAt),
    })),
  };
};

export const lockAccount = async (
  id: string,
  body: LockAccountBody,
  context: AdminContext,
): Promise<AccountActionResult> => {
  const result = await repository.withTransaction((session) =>
    lockAccountInSession(id, { duration: body.duration, reason: body.reason }, context, session),
  );
  notifyLocked(result, body.duration, body.reason);
  return {
    id,
    accountStatus: 'LOCKED',
    lockedUntil: toIsoString(result.until),
    listingsChanged: result.hiddenToyIds.length,
  };
};

export const unlockAccount = async (
  id: string,
  body: UnlockAccountBody,
  context: AdminContext,
): Promise<AccountActionResult> => {
  const result = await repository.withTransaction((session) =>
    unlockAccountInSession(id, body.reason, context, session),
  );
  notifyUnlocked(result, body.reason);
  return { id, accountStatus: 'ACTIVE', lockedUntil: null, listingsChanged: result.restored };
};
