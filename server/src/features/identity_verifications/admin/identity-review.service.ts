import { adminAuditEntry, writeAuditLog } from '../../../infrastructure/database/audit.js';
import { withTransaction } from '../../../infrastructure/database/schema-types.js';
import { verificationStatuses, type VerificationStatus } from '../../../shared/domain/statuses.js';
import { assertTransition } from '../../../shared/domain/transitions.js';
import { conflict, notFound } from '../../../shared/errors/app-error.js';
import { domainEvents } from '../../../shared/events/domain-events.js';
import type { AdminContext } from '../../../shared/http/admin-context.js';
import { zeroFilledCounts } from '../../../shared/utils/counts.js';
import { toSkipLimit } from '../../../shared/utils/response.js';
import { signDocuments, signedKeys } from './identity-review.documents.js';
import { toDetailUser, toQueueUser, toVerificationSummary } from './identity-review.mapper.js';
import * as repository from './identity-review.repository.js';
import type { IdentityQueueQuery } from './identity-review.schemas.js';
import { verificationTransitions } from './identity-review.transitions.js';

// Admin review of identity verifications (UC27, FE-01). The Admin compares both sides of the
// citizen ID card with the selfie by hand; there is no automatic eKYC (LI-04).

const verificationNotFound = () =>
  notFound('IDENTITY_VERIFICATION_NOT_FOUND', 'Không tìm thấy yêu cầu xác minh danh tính.');

const resolveSort = (query: IdentityQueueQuery): Record<string, 1 | -1> => {
  if (query.sortBy) {
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    return { [query.sortBy]: direction, _id: direction };
  }
  // Pending requests are served first come, first served (index admin_queue).
  return query.status === 'PENDING' ? { createdAt: 1, _id: 1 } : { reviewedAt: -1, _id: -1 };
};

export const listQueue = async (query: IdentityQueueQuery) => {
  let userIds: Awaited<ReturnType<typeof repository.findUserIdsMatching>> | undefined;
  if (query.q) {
    userIds = await repository.findUserIdsMatching(query.q);
    if (userIds.length === 0) return { items: [], total: 0 };
  }

  const { skip, limit } = toSkipLimit(query);
  const page = await repository.findQueuePage(
    { status: query.status, ...(userIds ? { userIds } : {}) },
    { skip, limit, sort: resolveSort(query) },
  );

  const pageUserIds = [
    ...new Map(page.items.map((item) => [String(item.userId), item.userId])).values(),
  ];
  const [users, submissions] = await Promise.all([
    repository.findUsersByIds(pageUserIds),
    repository.findSubmissionTimes(pageUserIds),
  ]);
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const now = new Date();

  const items = page.items.map((item) => {
    const user = usersById.get(String(item.userId));
    const times = submissions.get(String(item.userId)) ?? [];
    return {
      ...toVerificationSummary(item),
      user: user ? toQueueUser(user, now) : null,
      previousAttempts: times.filter((time) => time < item.createdAt).length,
    };
  });
  return { items, total: page.total };
};

export const countByStatus = async (): Promise<Record<VerificationStatus, number>> =>
  zeroFilledCounts(verificationStatuses, await repository.countByStatus());

/**
 * One request, with signed document links while it is PENDING. Every time links are handed
 * out, an `identity.view_documents` audit row records who received them (GB-35).
 */
export const getDetail = async (id: string, context: AdminContext) => {
  const verification = await repository.findVerificationById(id);
  if (!verification) throw verificationNotFound();

  const [user, previous] = await Promise.all([
    repository.findUserById(verification.userId),
    repository.findPreviousVerifications(
      verification.userId,
      verification.createdAt,
      verification._id,
    ),
  ]);
  const now = new Date();
  const signed = signDocuments(verification, { now });

  const viewed = signedKeys(signed.documents);
  if (viewed.length > 0) {
    // Not in a transaction: a read has nothing to roll back. If the audit write fails, the
    // links are not returned.
    await writeAuditLog(
      adminAuditEntry(
        context,
        'identity.view_documents',
        { kind: 'IDENTITY_VERIFICATION', id },
        {
          userId: String(verification.userId),
          documents: viewed,
          expiresAt: signed.previewExpiresAt,
        },
      ),
    );
  }

  return {
    ...toVerificationSummary(verification),
    reviewedBy: verification.reviewedBy ? String(verification.reviewedBy) : null,
    user: user ? toDetailUser(user, now) : null,
    ...signed,
    previousRequests: previous.map(toVerificationSummary),
  };
};

type Decision = 'VERIFIED' | 'REJECTED';

const decide = async (id: string, context: AdminContext, decision: Decision, reason?: string) => {
  assertTransition(verificationTransitions, 'PENDING', decision);
  const reviewedBy = context.actor.actorId;

  const result = await withTransaction(async (session) => {
    const reviewedAt = new Date();
    const verification = await repository.decidePendingVerification(
      id,
      { status: decision, reviewedBy, reviewedAt, ...(reason ? { rejectReason: reason } : {}) },
      session,
    );
    if (!verification) {
      if (await repository.verificationExists(id, session)) {
        throw conflict(
          'IDENTITY_VERIFICATION_ALREADY_DECIDED',
          'Yêu cầu xác minh này đã được xử lý trước đó.',
        );
      }
      throw verificationNotFound();
    }

    // users.identityStatus is the copy used by the "verified only" gates (GB-06).
    const userBefore = await repository.setUserIdentityStatus(
      verification.userId,
      decision,
      session,
    );
    if (!userBefore) {
      if (await repository.userExists(verification.userId, session)) {
        // Rejecting must not downgrade a user who is already VERIFIED (the transaction rolls
        // the request back to PENDING).
        throw conflict(
          'IDENTITY_ALREADY_VERIFIED',
          'Người dùng đã được xác minh danh tính, không thể từ chối yêu cầu này.',
        );
      }
      throw notFound('USER_NOT_FOUND', 'Không tìm thấy tài khoản người dùng của yêu cầu này.');
    }

    await writeAuditLog(
      adminAuditEntry(
        context,
        decision === 'VERIFIED' ? 'identity.verify' : 'identity.reject',
        { kind: 'IDENTITY_VERIFICATION', id },
        {
          userId: String(verification.userId),
          before: { status: 'PENDING', identityStatus: userBefore.identityStatus },
          after: { status: decision, identityStatus: decision, ...(reason ? { reason } : {}) },
        },
      ),
      session,
    );

    return {
      id: String(verification._id),
      status: decision,
      reviewedAt: reviewedAt.toISOString(),
      rejectReason: reason ?? null,
      user: { id: String(verification.userId), identityStatus: decision },
    };
  });

  // Only after the commit: the notifications feature tells the user the result.
  domainEvents.publish({
    type: 'IDENTITY_REVIEWED',
    verificationId: result.id,
    userId: result.user.id,
    decision,
    reviewedBy,
    ...(reason ? { reason } : {}),
  });
  return result;
};

export const approve = (id: string, context: AdminContext) => decide(id, context, 'VERIFIED');

export const reject = (id: string, context: AdminContext, reason: string) =>
  decide(id, context, 'REJECTED', reason);
