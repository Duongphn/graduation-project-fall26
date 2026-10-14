import type { Types } from 'mongoose';

import { adminAuditEntry, writeAuditLog } from '../../infrastructure/database/audit.js';
import { withTransaction } from '../../infrastructure/database/schema-types.js';
import type { ListingType } from '../../shared/domain/enums.js';
import { toyStatuses } from '../../shared/domain/statuses.js';
import { assertTransition, toyTransitions } from '../../shared/domain/transitions.js';
import { conflict, notFound, unprocessable } from '../../shared/errors/app-error.js';
import { domainEvents } from '../../shared/events/domain-events.js';
import type { AdminContext } from '../../shared/http/admin-context.js';
import { toIsoString } from '../../shared/utils/dates.js';
import { zeroFilledCounts } from '../../shared/utils/counts.js';
import { toMongoPaging } from '../../shared/utils/response.js';
import {
  isLocked,
  ownerAge,
  toDetailOwner,
  toListItem,
  type CategoryRow,
  type OwnerRow,
} from './toy-moderation.mapper.js';
import * as repository from './toy-moderation.repository.js';
import {
  toyModerationSortFields,
  type ApproveToyBody,
  type RejectToyBody,
  type ToyModerationCountsQuery,
  type ToyModerationDecision,
  type ToyModerationDetail,
  type ToyModerationListItem,
  type ToyModerationQueueQuery,
  type ToyStatusCounts,
} from './toy-moderation.schemas.js';
import { buildModerationWarnings } from './toy-moderation.warnings.js';

// Admin moderation of toy posts (UC27): every new or edited post stays PENDING_REVIEW until an
// Admin approves or rejects it (FE-03, GB-08). Nothing is approved automatically (LI-03).

const minPhotosSettingKey = {
  RENT: 'TOY_MIN_PHOTOS_RENT',
  SALE: 'TOY_MIN_PHOTOS_SALE',
  DONATION: 'TOY_MIN_PHOTOS_DONATION',
} as const satisfies Record<ListingType, string>;
// Used only if the settings collection has no value and no default (never in practice).
const FALLBACK_MIN_PHOTOS = 1;
const FALLBACK_MIN_AGE_YEARS = 18;

const toyNotFound = () => notFound('TOY_NOT_FOUND', 'Không tìm thấy tin đăng.');

const uniqueIds = (ids: Types.ObjectId[]): Types.ObjectId[] => [
  ...new Map(ids.map((id) => [String(id), id])).values(),
];

const byId = <T extends { _id: Types.ObjectId }>(rows: T[]): Map<string, T> =>
  new Map(rows.map((row) => [String(row._id), row]));

// ---- Queue ----

// Oldest submission first for the pending queue (index moderation_queue), newest first otherwise.
const resolvePaging = (query: ToyModerationQueueQuery) => {
  const paging = toMongoPaging(query, toyModerationSortFields);
  const sortable = (toyModerationSortFields as readonly string[]).includes(query.sortBy ?? '');
  if (sortable) return paging;
  const sort: repository.ToySort =
    query.status === 'PENDING_REVIEW'
      ? { 'moderation.submittedAt': 1, _id: 1 }
      : { createdAt: -1, _id: -1 };
  return { ...paging, sort };
};

export const listQueue = async (
  query: ToyModerationQueueQuery,
): Promise<{ items: ToyModerationListItem[]; totalItems: number }> => {
  const filter: repository.ToyQueueFilter = {
    status: query.status,
    listingType: query.listingType,
    categoryId: query.categoryId,
    q: query.q || undefined,
  };
  const [toys, totalItems] = await Promise.all([
    repository.findQueueToys(filter, resolvePaging(query)),
    repository.countToys(filter),
  ]);
  const [categories, owners] = await Promise.all([
    repository.findCategoriesByIds(uniqueIds(toys.map((toy) => toy.categoryId))),
    repository.findOwnersByIds(uniqueIds(toys.map((toy) => toy.ownerId))),
  ]);
  const categoryById = byId<CategoryRow>(categories);
  const ownerById = byId<OwnerRow>(owners);

  return {
    items: toys.map((toy) =>
      toListItem(toy, categoryById.get(String(toy.categoryId)), ownerById.get(String(toy.ownerId))),
    ),
    totalItems,
  };
};

/** Number of posts in every status, for the queue tabs. Filters other than status apply. */
export const countByStatus = async (query: ToyModerationCountsQuery): Promise<ToyStatusCounts> => {
  const rows = await repository.countToysByStatus({
    listingType: query.listingType,
    categoryId: query.categoryId,
    q: query.q || undefined,
  });
  return zeroFilledCounts(toyStatuses, rows);
};

// ---- Detail ----

export const getDetail = async (id: string): Promise<ToyModerationDetail> => {
  const toy = await repository.findToyById(id);
  if (!toy) throw toyNotFound();

  const photoKey = minPhotosSettingKey[toy.listingType];
  const reviewerId = toy.moderation?.reviewedBy;
  const [category, owners, reviewer, settings] = await Promise.all([
    repository.findCategoryById(toy.categoryId),
    repository.findOwnersByIds([toy.ownerId]),
    reviewerId ? repository.findUserNameById(reviewerId) : null,
    repository.findNumberSettings([photoKey, 'USER_MIN_AGE_YEARS']),
  ]);
  const owner = owners[0];
  const now = new Date();
  const minPhotos = settings[photoKey] ?? FALLBACK_MIN_PHOTOS;
  const minAgeYears = settings.USER_MIN_AGE_YEARS ?? FALLBACK_MIN_AGE_YEARS;

  const item = toListItem(toy, category, owner);
  const warnings = buildModerationWarnings({
    listingType: toy.listingType,
    imageCount: toy.images.length,
    minPhotos,
    text: `${toy.title}\n${toy.description}`,
    category: item.category,
    owner: owner
      ? {
          identityStatus: owner.identityStatus,
          locked: isLocked(owner, now),
          age: ownerAge(owner, now),
        }
      : null,
    minAgeYears,
  });

  return {
    ...item,
    description: toy.description,
    images: toy.images,
    minPhotos,
    minAgeYears,
    owner: owner ? toDetailOwner(owner, now) : null,
    moderation: {
      ...item.moderation,
      reviewedBy: reviewerId
        ? { id: String(reviewerId), fullName: reviewer?.fullName ?? null }
        : null,
      reviewedAt: toIsoString(toy.moderation?.reviewedAt),
    },
    warnings,
  };
};

// ---- Decisions ----

type Decision = { to: 'ACTIVE' } | { to: 'REJECTED'; reason: string };

const decide = async (
  toyId: string,
  expectedUpdatedAt: string,
  decision: Decision,
  context: AdminContext,
): Promise<ToyModerationDecision> => {
  const reviewerId = context.actor.actorId;
  const expected = new Date(expectedUpdatedAt);

  const { before, after } = await withTransaction(async (session) => {
    const current = await repository.findToyById(toyId, session);
    if (!current) throw toyNotFound();
    if (current.status !== 'PENDING_REVIEW') {
      throw conflict('TOY_ALREADY_DECIDED', 'Tin đăng không còn ở trạng thái chờ duyệt.', {
        status: current.status,
      });
    }
    if (current.updatedAt.getTime() !== expected.getTime()) {
      throw conflict(
        'TOY_CHANGED',
        'Người đăng vừa sửa tin này. Vui lòng tải lại để xem bản mới trước khi quyết định.',
        { updatedAt: current.updatedAt.toISOString() },
      );
    }
    assertTransition(toyTransitions, current.status, decision.to);

    if (decision.to === 'ACTIVE') {
      // BF-01: only a verified, unlocked owner may have an active post. The other checks of
      // the detail page (photos, contact details, age) stay advisory warnings (LI-03).
      const owner = await repository.findOwnerForDecision(current.ownerId, session);
      if (!owner || owner.identityStatus !== 'VERIFIED' || isLocked(owner, new Date())) {
        throw unprocessable(
          'OWNER_NOT_ELIGIBLE',
          !owner
            ? 'Không tìm thấy tài khoản người đăng, không thể duyệt tin này.'
            : owner.identityStatus !== 'VERIFIED'
              ? 'Người đăng chưa xác minh danh tính, không thể duyệt tin này.'
              : 'Tài khoản người đăng đang bị khoá, không thể duyệt tin này.',
          {
            identityStatus: owner?.identityStatus ?? null,
            locked: owner ? isLocked(owner, new Date()) : null,
          },
        );
      }

      // "Reject unsafe or banned categories": a hidden category gets no new approved posts.
      // A conditional write (not a read), so a concurrent hide or delete write-conflicts.
      if (!(await repository.lockActiveCategory(current.categoryId, session))) {
        const category = await repository.findCategoryById(current.categoryId, session);
        throw conflict(
          'CATEGORY_NOT_AVAILABLE',
          category
            ? `Danh mục "${category.name}" đang bị ẩn (bị cấm hoặc không phù hợp), không thể duyệt tin này.`
            : 'Danh mục của tin đăng không còn tồn tại, không thể duyệt tin này.',
        );
      }
    }

    const write = {
      toyId: current._id,
      expectedUpdatedAt: expected,
      reviewerId,
      reviewedAt: new Date(),
      session,
    };
    const updated =
      decision.to === 'ACTIVE'
        ? await repository.approvePending(write)
        : await repository.rejectPending({ ...write, reason: decision.reason });
    // Another Admin or an Owner edit won the race between the read and the write.
    if (!updated) {
      throw conflict(
        'TOY_CHANGED',
        'Tin đăng vừa thay đổi. Vui lòng tải lại trước khi quyết định.',
      );
    }

    await writeAuditLog(
      adminAuditEntry(
        context,
        decision.to === 'ACTIVE' ? 'toy.approve' : 'toy.reject',
        { kind: 'TOY', id: String(current._id) },
        {
          title: current.title,
          before: { status: current.status, updatedAt: current.updatedAt.toISOString() },
          after:
            decision.to === 'ACTIVE'
              ? { status: 'ACTIVE' }
              : { status: 'REJECTED', rejectReason: decision.reason },
        },
      ),
      session,
    );
    return { before: current, after: updated };
  });

  // After commit: the notifications feature tells the Owner (UC27 step 5).
  domainEvents.publish({
    type: 'TOY_REVIEWED',
    toyId: String(before._id),
    ownerId: String(before.ownerId),
    toyTitle: before.title,
    decision: decision.to,
    reviewedBy: reviewerId,
    ...(decision.to === 'REJECTED' ? { reason: decision.reason } : {}),
  });

  return {
    id: String(after._id),
    status: decision.to,
    updatedAt: after.updatedAt.toISOString(),
    moderation: {
      reviewedBy: reviewerId,
      reviewedAt: toIsoString(after.moderation?.reviewedAt) ?? '',
      rejectReason: after.moderation?.rejectReason ?? null,
    },
  };
};

export const approveToy = (
  toyId: string,
  body: ApproveToyBody,
  context: AdminContext,
): Promise<ToyModerationDecision> =>
  decide(toyId, body.expectedUpdatedAt, { to: 'ACTIVE' }, context);

export const rejectToy = (
  toyId: string,
  body: RejectToyBody,
  context: AdminContext,
): Promise<ToyModerationDecision> =>
  decide(toyId, body.expectedUpdatedAt, { to: 'REJECTED', reason: body.reason }, context);
