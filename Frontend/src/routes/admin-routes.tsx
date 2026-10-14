import type { RouteObject } from 'react-router-dom'

import { lazyPage } from './lazy-page'
import { adminChildPath, adminPaths } from './paths'

// Child routes of /admin. Each feature adds ONE block here and ONE entry in admin-menu.tsx.
// Pages live in src/features/<feature>/pages and are loaded with lazyPage.
export const adminRoutes: RouteObject[] = [
  // Toy moderation (UC27)
  { path: adminChildPath(adminPaths.toys), ...lazyPage(() => import('../features/toy-moderation/pages/ToyModerationQueuePage'), 'ToyModerationQueuePage') },
  { path: adminChildPath(adminPaths.toys, '/:id'), ...lazyPage(() => import('../features/toy-moderation/pages/ToyModerationReviewPage'), 'ToyModerationReviewPage') },
  // Toy categories (UC30)
  { path: adminChildPath(adminPaths.categories), ...lazyPage(() => import('../features/categories/pages/CategoriesPage'), 'CategoriesPage') },
  // Charity organizations (FE-02, UC34)
  { path: adminChildPath(adminPaths.organizations), ...lazyPage(() => import('../features/organizations/pages/OrganizationsPage'), 'OrganizationsPage') },
]
