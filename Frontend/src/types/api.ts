// Response envelopes of the backend (server/docs/api-conventions.md).
export interface ApiResponse<T> {
  success: true
  data: T
  message?: string
}

export interface PaginationMeta {
  page: number
  limit: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  pagination: PaginationMeta
}

export interface ValidationErrorDetail {
  field: string
  message: string
}

export interface ApiErrorBody {
  success: false
  error: { code: string; message: string; details?: unknown }
}

// Largest page size the backend accepts (MAX_PAGE_LIMIT on the server).
export const MAX_PAGE_LIMIT = 100

export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface Paginated<T> {
  items: T[]
  pagination: PaginationMeta
}

// A mutation result together with the backend's success message (shown as the toast).
export interface WithMessage<T> {
  data: T
  message?: string
}
