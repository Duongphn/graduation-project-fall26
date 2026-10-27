import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'

// Lazy-loads one page component by its export name, so each feature is its own chunk:
// { path: 'categories', ...lazyPage(() => import('../features/categories/pages/CategoriesPage'), 'CategoriesPage') }
export const lazyPage = <TModule extends Record<string, unknown>>(
  importer: () => Promise<TModule>,
  exportName: keyof TModule & string,
): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await importer())[exportName] as ComponentType }),
})
