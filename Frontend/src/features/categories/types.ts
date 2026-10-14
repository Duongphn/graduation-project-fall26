import type { VisibilityStatus } from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Toy categories (UC30). Shapes match server/src/features/categories/categories.schemas.ts.

export interface AdminCategory {
  id: string
  name: string
  slug: string
  description?: string
  displayOrder: number
  status: VisibilityStatus
  // Every toy that points to the category, in any status.
  toyCount: number
  // False while any toy points to it: it can only be hidden.
  canDelete: boolean
  createdAt: string
  updatedAt: string
}

export interface PublicCategory {
  id: string
  name: string
  slug: string
  description?: string
}

export interface CategoryListParams extends PaginationParams {
  status?: VisibilityStatus
  q?: string
}

// One option of an Admin category filter.
export type CategoryOption = Pick<AdminCategory, 'id' | 'name' | 'status'>

export interface CategoryCreateInput {
  name: string
  description?: string
  displayOrder?: number
}

export interface CategoryUpdateInput {
  name?: string
  // null removes the description.
  description?: string | null
  displayOrder?: number
}
