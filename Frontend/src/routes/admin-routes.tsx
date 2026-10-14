import type { RouteObject } from 'react-router-dom'

import { lazyPage } from './lazy-page'
import { adminChildPath, adminPaths } from './paths'

// Child routes of /admin. Each feature adds ONE block here and ONE entry in admin-menu.tsx.
// Pages live in src/features/<feature>/pages and are loaded with lazyPage.
export const adminRoutes: RouteObject[] = [
  // Toy categories (UC30)
  { path: adminChildPath(adminPaths.categories), ...lazyPage(() => import('../features/categories/pages/CategoriesPage'), 'CategoriesPage') },
]
