// Response envelopes of the backend (server/docs/api-conventions.md).
export type { ApiResponse } from '../services/http-client'
import type { ApiResponse } from '../services/http-client'

export interface PaginationMeta {
  page: number
  limit: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginatedResponse<T> extends Omit<ApiResponse<T[]>, 'data'> {
  data: T[]
  pagination: PaginationMeta
}

export interface ValidationErrorDetail {
  field: string
  message: string
}

// Error body of develop's errorHandler.
export interface ApiErrorBody {
  error?: { code: string; message: string; details?: unknown }
}

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
