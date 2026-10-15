import type { ClientSession } from 'mongoose';

import {
  adminAuditEntry,
  writeAuditLog,
  type AuditAction,
} from '../../infrastructure/database/audit.js';
import { withTransaction } from '../../infrastructure/database/schema-types.js';
import type { VisibilityStatus } from '../../shared/domain/statuses.js';
import { assertTransition } from '../../shared/domain/transitions.js';
import type { AdminContext } from '../../shared/http/admin-context.js';
import { isDuplicateKeyError } from '../../shared/utils/mongo-errors.js';
import { toSkipLimit } from '../../shared/utils/response.js';
import { pickFreeSlug, slugify } from '../../shared/utils/slug.js';
import { accentInsensitivePattern } from '../../shared/utils/text.js';
import { toAdminCategory, toAuditSnapshot, toPublicCategory } from './categories.mapper.js';
import { categoriesRepository as repo, type CategoryRecord } from './categories.repository.js';
import {
  categoriesNotFound,
  reorderIncomplete,
  categoryInUse,
  categoryNameTaken,
  categoryNotFound,
  categoryStatusChanged,
  visibilityChanges,
  visibilityTransitions,
} from './categories.rules.js';
import type {
  AdminCategoryListQuery,
  AdminCategoryView,
  CreateCategoryBody,
  PublicCategoryView,
  ReorderCategoriesBody,
  UpdateCategoryBody,
} from './categories.schemas.js';

// Two names can give the same slug at the same time; the slug index rejects one, which retries.
const MAX_CREATE_ATTEMPTS = 3;

const audit = (
  context: AdminContext,
  action: AuditAction,
  target: CategoryRecord | undefined,
  meta: Record<string, unknown>,
  session: ClientSession,
) =>
  writeAuditLog(
    adminAuditEntry(
      context,
      action,
      { kind: 'CATEGORY', ...(target ? { id: String(target._id) } : {}) },
      meta,
    ),
    session,
  );

// Counted after the commit, outside the transaction: the count is display-only (toyCount and
// canDelete in the Admin list); delete re-counts inside its own transaction.
const withToyCount = async (category: CategoryRecord): Promise<AdminCategoryView> => {
  const counts = await repo.countToys([category._id]);
  return toAdminCategory(category, counts.get(String(category._id)) ?? 0);
};

/** Throws CATEGORY_NAME_TAKEN for a duplicate key on name_unique (two Admins at once). */
const rethrowNameTaken = (error: unknown): never => {
  if (isDuplicateKeyError(error, 'name_unique')) throw categoryNameTaken();
  throw error;
};

export const listAdminCategories = async (query: AdminCategoryListQuery) => {
  const { items, total } = await repo.list(
    {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { textPattern: accentInsensitivePattern(query.q) } : {}),
    },
    toSkipLimit(query),
  );
  const counts = await repo.countToys(items.map((category) => category._id));
  return {
    items: items.map((category) =>
      toAdminCategory(category, counts.get(String(category._id)) ?? 0),
    ),
    total,
  };
};

export const listPublicCategories = async (): Promise<PublicCategoryView[]> =>
  (await repo.listActive()).map(toPublicCategory);

export const createCategory = async (
  input: CreateCategoryBody,
  context: AdminContext,
): Promise<AdminCategoryView> => {
  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
    try {
      const created = await withTransaction(async (session) => {
        if (await repo.existsByName(input.name, undefined, session)) throw categoryNameTaken();
        const slug = await pickFreeSlug(
          slugify(input.name, { fallback: 'danh-muc' }),
          (candidate) => repo.isSlugTaken(candidate, session),
        );
        const category = await repo.create(
          {
            name: input.name,
            slug,
            displayOrder: input.displayOrder ?? (await repo.maxDisplayOrder(session)) + 1,
            ...(input.description ? { description: input.description } : {}),
          },
          session,
        );
        await audit(
          context,
          'category.create',
          category,
          { after: toAuditSnapshot(category) },
          session,
        );
        return category;
      });
      return toAdminCategory(created, 0);
    } catch (error) {
      if (isDuplicateKeyError(error, 'slug_unique') && attempt < MAX_CREATE_ATTEMPTS) continue;
      return rethrowNameTaken(error);
    }
  }
  // Unreachable: the last attempt returns or rethrows above.
  throw new Error('Category create retries exhausted.');
};

// The slug is NOT regenerated on rename: it is the stable public key of the category (filter
// URLs, shared links), so renaming never breaks a link.
export const updateCategory = async (
  id: string,
  input: UpdateCategoryBody,
  context: AdminContext,
): Promise<AdminCategoryView> => {
  const updated = await withTransaction(async (session) => {
    const current = await repo.findById(id, session);
    if (!current) throw categoryNotFound();

    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    if (input.name !== undefined && input.name !== current.name) {
      if (await repo.existsByName(input.name, id, session)) throw categoryNameTaken();
      set.name = input.name;
    }
    if (input.description !== undefined) {
      const description = input.description || undefined;
      if (!description && current.description) unset.push('description');
      if (description && description !== current.description) set.description = description;
    }
    if (input.displayOrder !== undefined && input.displayOrder !== current.displayOrder) {
      set.displayOrder = input.displayOrder;
    }
    if (Object.keys(set).length === 0 && unset.length === 0) return current;

    const category = await repo.update(id, { set, unset }, session);
    if (!category) throw categoryNotFound();
    await audit(
      context,
      'category.update',
      category,
      { before: toAuditSnapshot(current), after: toAuditSnapshot(category) },
      session,
    );
    return category;
  }).catch(rethrowNameTaken);
  return withToyCount(updated);
};

// Hide: the category leaves the public list, so no new post can pick it; existing toys keep it.
// The update is conditional on the status just read, so two Admins cannot both succeed.
export const changeCategoryVisibility = async (
  id: string,
  to: VisibilityStatus,
  context: AdminContext,
): Promise<AdminCategoryView> => {
  const change = visibilityChanges[to];
  const changed = await withTransaction(async (session) => {
    const current = await repo.findById(id, session);
    if (!current) throw categoryNotFound();
    if (current.status === to) throw change.alreadyThere();
    assertTransition(visibilityTransitions, current.status, to);
    const category = await repo.changeStatus(id, current.status, to, session);
    if (!category) throw categoryStatusChanged();
    await audit(
      context,
      change.action,
      category,
      { before: { status: current.status }, after: { status: to } },
      session,
    );
    return category;
  });
  return withToyCount(changed);
};

// Hard delete only when no toy points to the category; otherwise the Admin hides it.
// Race with a toy being saved: the category document is written first (lockForDelete), and the
// toys feature writes the same document when it saves a toy, so the two transactions conflict
// and the loser retries with fresh data. See README.md.
export const deleteCategory = async (id: string, context: AdminContext): Promise<void> => {
  await withTransaction(async (session) => {
    const category = await repo.lockForDelete(id, session);
    if (!category) throw categoryNotFound();
    const toyCount = (await repo.countToys([category._id], session)).get(String(category._id)) ?? 0;
    if (toyCount > 0) throw categoryInUse(toyCount);
    if (!(await repo.deleteById(id, session))) throw categoryNotFound();
    await audit(
      context,
      'category.delete',
      category,
      { before: toAuditSnapshot(category) },
      session,
    );
  });
};

// displayOrder = 1, 2, 3... in the given order. The list must name every category (422
// REORDER_INCOMPLETE otherwise), so a stale client cannot move the categories it did not see.
export const reorderCategories = async (
  input: ReorderCategoriesBody,
  context: AdminContext,
): Promise<void> => {
  await withTransaction(async (session) => {
    const all = await repo.listAll(session);
    const byId = new Map(all.map((category) => [String(category._id), category]));
    const missing = input.ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw categoriesNotFound(missing.length);
    }
    if (input.ids.length < all.length) {
      throw reorderIncomplete(all.length - input.ids.length);
    }
    const ordered = input.ids.map((id) => byId.get(id) as CategoryRecord);
    const changes = ordered
      .map((category, index) => ({
        id: category._id,
        from: category.displayOrder,
        displayOrder: index + 1,
      }))
      .filter((change) => change.from !== change.displayOrder);
    if (changes.length === 0) return;

    await repo.setDisplayOrders(changes, session);
    // Collection-level action: no target id, the new order is in meta.
    await audit(
      context,
      'category.reorder',
      undefined,
      {
        before: all.map((category) => String(category._id)),
        after: ordered.map((category) => String(category._id)),
      },
      session,
    );
  });
};
