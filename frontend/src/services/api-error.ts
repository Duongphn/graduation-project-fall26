import type { ValidationErrorDetail } from '../types/api'

// Error thrown by every API call: code and message come from the backend error envelope.
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  // Field errors of a VALIDATION_ERROR (400 from Zod, 422 from the database rules).
  get fieldErrors(): ValidationErrorDetail[] {
    return Array.isArray(this.details) ? (this.details as ValidationErrorDetail[]) : []
  }
}

const GENERIC_MESSAGE = 'Đã có lỗi xảy ra. Vui lòng thử lại.'

// The message to show for any thrown value (backend message when it is an ApiError).
export const getErrorMessage = (error: unknown, fallback = GENERIC_MESSAGE): string =>
  error instanceof ApiError ? error.message : fallback
