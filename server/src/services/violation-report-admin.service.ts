import { Types } from 'mongoose';

import { reportStatuses, type ReportAction } from '../constants/violation-report.js';
import * as repository from '../repositories/violation-report.repository.js';
import { countViolationsOf } from '../repositories/account-admin.repository.js';
import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import type { AdminContext } from '../utils/admin-context.js';
import { buildPrivateImageUrl } from '../utils/cloudinary-signing.js';
import { zeroFilledCounts } from '../utils/counts.js';
import { toIsoString } from '../utils/dates.js';
import { conflict, notFound, unprocessable } from '../utils/http-errors.js';
import { maskPhone } from '../utils/phone.js';
import { toSkipLimit } from '../utils/response.js';
import type {
  AdminReportCountsQuery,
  AdminReportDetail,
  AdminReportListItem,
  AdminReportListQuery,
  ReportStatusCounts,
  ResolveReportBody,
  ResolveReportResult,
} from '../validations/violation-report.validation.js';
import {
  isAdminLocked,
  lockAccountInSession,
  notifyLocked,
  type LockResult,
} from './account-lock.service.js';
import {
  accountWarnedNotice,
  listingRemovedNotice,
  reportHandledNotice,
  sendNotices,
  type AccountNotice,
} from './account-moderation.notices.js';

// UC29 Handle Reports: the Admin dismisses a report, removes the reported listing, warns the
// reported user or locks the account. Unsafe toy reports come first (GB-49). Closing a report
// also closes the other pending reports on the same target, with the same outcome.

const reportNotFound = () => notFound('REPORT_NOT_FOUND', 'Không tìm thấy báo cáo.');

const MESSAGE_LABEL_LENGTH = 80;

const uniqueIds = (ids: Array<Types.ObjectId | undefined>): Types.ObjectId[] => [
  ...new Map(
    ids.filter((id): id is Types.ObjectId => Boolean(id)).map((id) => [String(id), id]),
  ).values(),
];

// Pending: unsafe first, then the oldest first (the longest-waiting report is handled first).
// Closed: the most recently handled first (sortOrder=asc reverses it).
const sortFor = (status: AdminReportListQuery['status'], order: 'asc' | 'desc') => {
  if (status === 'pending') {
    return { isUnsafe: -1, createdAt: 1, _id: 1 } as Record<string, 1 | -1>;
  }
  const direction = order === 'asc' ? 1 : -1;
  return { 'resolution.resolvedAt': direction, createdAt: direction, _id: direction } as Record<
    string,
    1 | -1
  >;
};

const toResolution = (
  report: repository.ReportRecord,
  names: Map<string, string>,
): AdminReportListItem['resolution'] =>
  report.resolution?.action
    ? {
        action: report.resolution.action,
        lockDuration: report.resolution.lockDuration ?? null,
        note: report.resolution.note ?? null,
        resolvedAt: toIsoString(report.resolution.resolvedAt),
        resolvedBy: report.resolvedBy
          ? { id: String(report.resolvedBy), fullName: names.get(String(report.resolvedBy)) ?? null }
          : null,
        viaReportId: report.resolution.viaReportId ? String(report.resolution.viaReportId) : null,
      }
    : null;

interface Lookups {
  toys: Map<string, repository.ToyTarget>;
  users: Map<string, repository.UserTarget>;
  messages: Map<string, repository.MessageTarget>;
}

const loadLookups = async (reports: repository.ReportRecord[]): Promise<Lookups> => {
  const idsOf = (kind: string) =>
    uniqueIds(reports.filter((report) => report.target.kind === kind).map((r) => r.target.id));
  const [toys, messages, users] = await Promise.all([
    repository.findToysByIds(idsOf('toy')),
    repository.findMessagesByIds(idsOf('message')),
    repository.findUsersByIds(
      uniqueIds(
        reports.flatMap((report) => [
          report.reporterId,
          report.target.userId,
          report.resolvedBy,
          report.target.kind === 'user' ? report.target.id : undefined,
        ]),
      ),
    ),
  ]);
  return {
    toys: new Map(toys.map((toy) => [String(toy._id), toy])),
    users: new Map(users.map((user) => [String(user._id), user])),
    messages: new Map(messages.map((message) => [String(message._id), message])),
  };
};

const targetLabel = (report: repository.ReportRecord, lookups: Lookups): string | null => {
  const id = String(report.target.id);
  if (report.target.kind === 'toy') return lookups.toys.get(id)?.title ?? null;
  if (report.target.kind === 'user') return lookups.users.get(id)?.fullName ?? null;
  const content = lookups.messages.get(id)?.content;
  if (content === undefined) return null;
  return content.length > MESSAGE_LABEL_LENGTH
    ? `${content.slice(0, MESSAGE_LABEL_LENGTH - 1)}…`
    : content;
};

const person = (id: Types.ObjectId | undefined, lookups: Lookups) =>
  id ? { id: String(id), fullName: lookups.users.get(String(id))?.fullName ?? null } : null;

const toListItem = (report: repository.ReportRecord, lookups: Lookups): AdminReportListItem => {
  const names = new Map([...lookups.users].map(([id, user]) => [id, user.fullName]));
  return {
    id: String(report._id),
    status: report.status,
    reason: report.reason,
    isUnsafe: report.isUnsafe,
    unsafeIssues: report.unsafeIssues ?? [],
    description: report.description,
    target: {
      kind: report.target.kind,
      id: String(report.target.id),
      label: targetLabel(report, lookups),
    },
    reporter: person(report.reporterId, lookups),
    reportedUser: person(report.target.userId, lookups),
    evidenceCount: report.evidence?.length ?? 0,
    resolution: toResolution(report, names),
    createdAt: report.createdAt.toISOString(),
  };
};

export const listReports = async (
  query: AdminReportListQuery,
): Promise<{ items: AdminReportListItem[]; totalItems: number }> => {
  const filter: repository.ReportFilter = {
    status: query.status,
    reason: query.reason,
    targetKind: query.targetKind,
    reportedUserId: query.reportedUserId,
  };
  const [reports, totalItems] = await Promise.all([
    repository.findReports(filter, {
      ...toSkipLimit(query),
      sort: sortFor(query.status, query.sortOrder),
    }),
    repository.countReports(filter),
  ]);
  const lookups = await loadLookups(reports);
  return { items: reports.map((report) => toListItem(report, lookups)), totalItems };
};

export const countReportsByStatus = async (
  query: AdminReportCountsQuery,
): Promise<ReportStatusCounts> =>
  zeroFilledCounts(
    reportStatuses,
    await repository.countReportsByStatus({ reason: query.reason, targetKind: query.targetKind }),
  );

export const getReportDetail = async (id: string): Promise<AdminReportDetail> => {
  const report = await repository.findReportById(id);
  if (!report) throw reportNotFound();
  const lookups = await loadLookups([report]);
  const item = toListItem(report, lookups);
  const targetId = String(report.target.id);
  const reporter = lookups.users.get(String(report.reporterId));
  const reportedUser = report.target.userId
    ? lookups.users.get(String(report.target.userId))
    : undefined;
  const toy = report.target.kind === 'toy' ? lookups.toys.get(targetId) : undefined;
  const message = report.target.kind === 'message' ? lookups.messages.get(targetId) : undefined;
  const [counts, others] = await Promise.all([
    reportedUser ? countViolationsOf(reportedUser._id) : null,
    report.status === 'pending' ? repository.findOtherPendingOnTarget(report) : [],
  ]);

  return {
    ...item,
    reporter: reporter
      ? { id: String(reporter._id), fullName: reporter.fullName, maskedPhone: maskPhone(reporter.phone) }
      : null,
    reportedUser:
      reportedUser && counts
        ? {
            id: String(reportedUser._id),
            fullName: reportedUser.fullName,
            maskedPhone: maskPhone(reportedUser.phone),
            role: reportedUser.role,
            accountStatus: isAdminLocked(reportedUser) ? 'LOCKED' : 'ACTIVE',
            lockedUntil: isAdminLocked(reportedUser)
              ? toIsoString(reportedUser.lock?.until)
              : null,
            ...counts,
          }
        : null,
    toy: toy
      ? {
          id: String(toy._id),
          title: toy.title,
          status: toy.status,
          listingType: toy.listingType,
          coverImage: toy.images[0]?.url ?? null,
          rejectReason: toy.moderation?.rejectReason ?? null,
        }
      : null,
    message: message
      ? {
          id: String(message._id),
          content: message.content,
          sentAt: message.createdAt.toISOString(),
          conversationId: String(message.conversationId),
        }
      : null,
    // Signed links valid for a few minutes (R04 III.1.3); null when Cloudinary is not set up.
    evidence: (report.evidence ?? []).map((photo) => {
      const signed = buildPrivateImageUrl(photo);
      return { url: signed?.url ?? null, expiresAt: toIsoString(signed?.expiresAt) };
    }),
    otherPendingReports: others.length,
  };
};

// ---- Resolve ----

const auditActionOf: Record<ReportAction, `report.${string}`> = {
  dismiss: 'report.dismiss',
  remove_listing: 'report.remove_listing',
  warn: 'report.warn',
  lock: 'report.lock',
};

export const resolveReport = async (
  id: string,
  body: ResolveReportBody,
  context: AdminContext,
): Promise<ResolveReportResult> => {
  const adminId = new Types.ObjectId(context.actor.actorId);

  const outcome = await repository.withTransaction(async (session) => {
    const report = await repository.findReportById(id, session);
    if (!report) throw reportNotFound();
    if (report.status !== 'pending') {
      throw conflict('REPORT_ALREADY_HANDLED', 'Báo cáo này đã được xử lý.', {
        status: report.status,
      });
    }
    const reportedUserId = report.target.userId ? String(report.target.userId) : undefined;
    const notices: AccountNotice[] = [];
    let lock: LockResult | undefined;

    if (body.action === 'remove_listing') {
      if (report.target.kind !== 'toy') {
        throw unprocessable('ACTION_NOT_ALLOWED', 'Chỉ gỡ được tin đăng khi báo cáo về tin đăng.');
      }
      const toy = await repository.removeToy(report.target.id, body.note, adminId, session);
      if (!toy) throw notFound('TOY_NOT_FOUND', 'Không tìm thấy tin đăng.');
      await writeAuditLog(
        adminAuditEntry(
          context,
          'toy.remove',
          { kind: 'TOY', id: String(toy._id) },
          { reason: body.note, reportId: id },
        ),
        session,
      );
      notices.push(listingRemovedNotice(String(toy.ownerId), toy.title, body.note));
    }

    if (body.action === 'warn' || body.action === 'lock') {
      if (!reportedUserId) {
        throw unprocessable('ACTION_NOT_ALLOWED', 'Báo cáo không gắn với người dùng nào.');
      }
    }
    if (body.action === 'warn' && reportedUserId) {
      await writeAuditLog(
        adminAuditEntry(context, 'user.warn', { kind: 'USER', id: reportedUserId }, {
          reason: body.note,
          reportId: id,
        }),
        session,
      );
      notices.push(accountWarnedNotice(reportedUserId, body.note));
    }
    if (body.action === 'lock' && reportedUserId && body.lockDuration) {
      lock = await lockAccountInSession(
        reportedUserId,
        { duration: body.lockDuration, reason: body.note, reportId: id },
        context,
        session,
      );
    }

    // This report and every other pending report on the same target get the same outcome.
    const others = await repository.findOtherPendingOnTarget(report, session);
    const status = body.action === 'dismiss' ? 'dismissed' : 'resolved';
    const resolution = {
      action: body.action,
      ...(body.lockDuration ? { lockDuration: body.lockDuration } : {}),
      note: body.note,
      resolvedAt: new Date(),
    };
    const closedThis = await repository.closeReports(
      [report._id],
      { status, resolvedBy: adminId, resolution },
      session,
    );
    if (closedThis !== 1) {
      throw conflict('REPORT_ALREADY_HANDLED', 'Báo cáo này đã được xử lý.');
    }
    if (others.length > 0) {
      await repository.closeReports(
        others.map((other) => other._id),
        { status, resolvedBy: adminId, resolution: { ...resolution, viaReportId: report._id } },
        session,
      );
    }
    await writeAuditLog(
      adminAuditEntry(context, auditActionOf[body.action], { kind: 'VIOLATION_REPORT', id }, {
        targetKind: report.target.kind,
        reason: report.reason,
        ...(body.lockDuration ? { lockDuration: body.lockDuration } : {}),
        closedWithIt: others.length,
      }),
      session,
    );

    for (const reporterId of uniqueIds([report.reporterId, ...others.map((o) => o.reporterId)])) {
      notices.push(reportHandledNotice(String(reporterId), body.action));
    }
    return {
      status,
      closedReportIds: [report._id, ...others.map((other) => other._id)].map(String),
      notices,
      lock,
    } as const;
  });

  // After the commit: the reported user, the listing owner and the reporters are told.
  sendNotices(outcome.notices);
  if (outcome.lock && body.lockDuration) {
    notifyLocked(outcome.lock, body.lockDuration, body.note);
  }

  return {
    id,
    status: outcome.status,
    action: body.action,
    closedReportIds: outcome.closedReportIds,
  };
};
