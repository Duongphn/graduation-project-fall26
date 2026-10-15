import type { CategoryRecord } from './categories.repository.js';
import type { AdminCategoryView, PublicCategoryView } from './categories.schemas.js';

export const toAdminCategory = (category: CategoryRecord, toyCount: number): AdminCategoryView => ({
  id: String(category._id),
  name: category.name,
  slug: category.slug,
  ...(category.description ? { description: category.description } : {}),
  displayOrder: category.displayOrder,
  status: category.status,
  toyCount,
  canDelete: toyCount === 0,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
});

export const toPublicCategory = (category: CategoryRecord): PublicCategoryView => ({
  id: String(category._id),
  name: category.name,
  slug: category.slug,
  ...(category.description ? { description: category.description } : {}),
});

/** The fields kept in audit_logs.meta (before / after). */
export const toAuditSnapshot = (category: CategoryRecord) => ({
  name: category.name,
  slug: category.slug,
  description: category.description ?? null,
  displayOrder: category.displayOrder,
  status: category.status,
});
