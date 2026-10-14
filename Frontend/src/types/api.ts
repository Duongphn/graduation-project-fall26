/** Envelope phản hồi thành công của backend — xem server/docs/api-conventions.md */
export interface ApiResponse<T> {
  success: true
  data: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
