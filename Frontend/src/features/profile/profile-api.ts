import { getApiErrorCode, getApiErrorMessage, httpClient, type ApiResponse } from '../../services/http-client'

/** Các endpoint /users và /identity-verifications bọc kết quả trong envelope `{ success, data }` */

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'

export interface ProfileAddress {
  province: string
  district: string
  ward: string
  street: string
}

export interface UserProfile {
  id: string
  fullName: string
  email: string
  phone: string
  verificationStatus: VerificationStatus
  role: 'USER' | 'ADMIN'
  avatarUrl?: string
  address?: ProfileAddress
}

/** Lần nộp hồ sơ xác minh gần nhất — `null` khi người dùng chưa nộp lần nào */
export interface LatestVerification {
  id: string
  status: Exclude<VerificationStatus, 'unverified'>
  submittedAt: string
  rejectionReason: string | null
  reviewedAt: string | null
}

export async function fetchProfile(): Promise<UserProfile> {
  const { data } = await httpClient.get<ApiResponse<UserProfile>>('/users/profile')
  return data.data
}

/** Backend chỉ cho sửa `fullName` và `address`; gửi trường khác sẽ bị từ chối 400 */
export async function updateProfile(patch: { fullName?: string; address?: ProfileAddress }): Promise<UserProfile> {
  const { data } = await httpClient.patch<ApiResponse<UserProfile>>('/users/profile', patch)
  return data.data
}

export async function uploadAvatar(file: File): Promise<string> {
  const form = new FormData()
  form.append('avatar', file)
  const { data } = await httpClient.post<ApiResponse<{ avatarUrl: string }>>('/users/avatar', form, { timeout: 60_000 })
  return data.data.avatarUrl
}

export async function fetchLatestVerification(): Promise<LatestVerification | null> {
  const { data } = await httpClient.get<ApiResponse<LatestVerification | null>>('/identity-verifications/my-latest')
  return data.data
}

/** Backend trả message tiếng Anh; dịch các mã lỗi người dùng có thể tự khắc phục */
const PROFILE_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem hồ sơ.',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản. Vui lòng đăng nhập lại.',
  FILE_TOO_LARGE: 'Ảnh đại diện lớn hơn 5 MB. Hãy chọn ảnh nhỏ hơn.',
  INVALID_IMAGE_TYPE: 'Ảnh không đúng định dạng JPG, PNG hoặc WebP. Hãy chọn ảnh khác.',
  STORAGE_ERROR: 'Máy chủ lưu ảnh chưa sẵn sàng. Vui lòng thử lại sau ít phút.',
}

export function getProfileErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error)
  return (code && PROFILE_ERROR_MESSAGES[code]) || getApiErrorMessage(error)
}

export function isUnauthorizedError(error: unknown): boolean {
  return getApiErrorCode(error) === 'UNAUTHORIZED'
}
