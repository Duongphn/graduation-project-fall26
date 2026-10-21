import { DefaultIdentityVerificationEvents } from '../../../infrastructure/events/identity-verification-events.js';
import { adminAuditEntry, writeAuditLog } from '../../../infrastructure/database/audit.js';
import { notFound } from '../../../shared/errors/http-errors.js';
import { domainEvents } from '../../../shared/events/domain-events.js';
import type { AdminContext } from '../../../shared/http/admin-context.js';
import { zeroFilledCounts } from '../../../shared/utils/counts.js';
import { toSkipLimit } from '../../../shared/utils/response.js';
import { assertTransition } from '../../../shared/utils/transitions.js';
import { IdentityVerificationService } from '../identity-verification.service.js';
import type { VerificationStatus } from '../identity-verification.ports.js';
import { getReviewStorage, signDocuments, signedKeys } from './identity-review.documents.js';
import { toDetailUser, toQueueUser, toVerificationSummary } from './identity-review.mapper.js';
import * as repository from './identity-review.repository.js';
import type { IdentityQueueQuery } from './identity-review.schemas.js';
import { verificationStatuses, verificationTransitions } from './identity-review.transitions.js';

// Admin review screens of identity verifications. The decision itself is develop's
// IdentityVerificationService.review (status, reviewedBy/At, rejectionReason, the user's
// verificationStatus + idCardNumber, and the in-app notification of
// DefaultIdentityVerificationEvents); this module adds the queue search, counts, previous
// requests, document links and the audit log.

const verificationNotFound = () =>
  notFound('NOT_FOUND', 'Verification submission not found.');

const resolveSort = (query: IdentityQueueQuery): Record<string, 1 | -1> => {
  if (query.sortBy) {
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    return { [query.sortBy]: direction, _id: direction };
  }
  // Pending requests are served first come, first served (index admin_queue).
  return query.status === 'pending' ? { submittedAt: 1, _id: 1 } : { reviewedAt: -1, _id: -1 };
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

  const items = page.items.map((item) => {
    const user = usersById.get(String(item.userId));
    const times = submissions.get(String(item.userId)) ?? [];
    return {
      ...toVerificationSummary(item),
      user: user ? toQueueUser(user) : null,
      previousAttempts: times.filter((time) => time < item.submittedAt).length,
    };
  });
  return { items, total: page.total };
};

export const countByStatus = async (): Promise<Record<VerificationStatus, number>> =>
  zeroFilledCounts(verificationStatuses, await repository.countByStatus());

/**
 * One request, with document links while it is pending. Every time links are handed out, an
 * `identity.view_documents` audit row records who received them.
 */
export const getDetail = async (id: string, context: AdminContext) => {
  const verification = await repository.findVerificationById(id);
  if (!verification) throw verificationNotFound();

  const [user, previous] = await Promise.all([
    repository.findUserById(verification.userId),
    repository.findPreviousVerifications(
      verification.userId,
      verification.submittedAt,
      verification._id,
    ),
  ]);
  const signed = await signDocuments(verification);

  if (signedKeys(signed.documents).length > 0) {
    // If the audit write fails, the links are not returned.
    await writeAuditLog(
      adminAuditEntry(context, 'identity.view_documents', { kind: 'IDENTITY_VERIFICATION', id }),
    );
  }

  return {
    ...toVerificationSummary(verification),
    reviewedBy: verification.reviewedBy ? String(verification.reviewedBy) : null,
    phone: verification.phone,
    idCardNumber: verification.idCardNumber,
    user: user ? toDetailUser(user, new Date()) : null,
    ...signed,
    previousRequests: previous.map(toVerificationSummary),
  };
};

const createReviewService = () =>
  new IdentityVerificationService(
    undefined,
    undefined,
    getReviewStorage() ?? undefined,
    new DefaultIdentityVerificationEvents(),
  );

type Decision = 'verified' | 'rejected';

const decide = async (id: string, context: AdminContext, decision: Decision, reason?: string) => {
  assertTransition(verificationTransitions, 'pending', decision);
  const reviewedBy = context.actor.actorId;

  // Develop's review: 404 NOT_FOUND, 409 SUBMISSION_NOT_PENDING when already decided.
  const receipt = await createReviewService().review(reviewedBy, id, {
    action: decision === 'verified' ? 'approve' : 'reject',
    ...(reason ? { rejectionReason: reason } : {}),
  });
  const verification = await repository.findVerificationById(id);
  const userId = verification ? String(verification.userId) : '';

  await writeAuditLog(
    adminAuditEntry(context, decision === 'verified' ? 'identity.verify' : 'identity.reject', {
      kind: 'IDENTITY_VERIFICATION',
      id,
    }),
  );

  // For other subscribers (e.g. email). The in-app notification is already written by
  // develop's DefaultIdentityVerificationEvents.
  domainEvents.publish({
    type: 'IDENTITY_REVIEWED',
    verificationId: receipt.id,
    userId,
    decision,
    reviewedBy,
    ...(reason ? { reason } : {}),
  });

  return {
    id: receipt.id,
    status: receipt.status,
    reviewedAt: receipt.reviewedAt.toISOString(),
    rejectionReason: receipt.rejectionReason ?? null,
    user: { id: userId, verificationStatus: decision },
  };
};

export const approve = (id: string, context: AdminContext) => decide(id, context, 'verified');

export const reject = (id: string, context: AdminContext, reason: string) =>
  decide(id, context, 'rejected', reason);
