import type { CategoryRecord } from './categories.repository.js';
import type { AdminCategoryView } from './categories.schemas.js';

export const toAdminCategory = (category: CategoryRecord, toyCount: number): AdminCategoryView => ({
  id: String(category._id),
  name: category.name,
  slug: category.slug,
  ...(category.description ? { description: category.description } : {}),
  displayOrder: category.displayOrder,
  // Develop data may hold other casings ('ACTIVE'); the API answers the lowercase value.
  status: category.status.toLowerCase() === 'hidden' ? 'hidden' : 'active',
  toyCount,
  canDelete: toyCount === 0,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
});

