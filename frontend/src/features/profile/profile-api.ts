import { getApiErrorCode, getApiErrorMessage, httpClient, type ApiResponse } from '../../services/http-client'

/** Các endpoint /users và /identity-verifications bọc kết quả trong envelope `{ success, data }` */

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'

export type Gender = 'female' | 'male' | 'other'

export interface UserProfile {
  id: string
  fullName: string
  email: string
  phone: string
  /** YYYY-MM-DD */
  dateOfBirth: string | null
  gender: Gender | null
  bio: string | null
  /** Chỉ đọc (GB-29) */
  trustScore: number
  /** Ngày tham gia (ISO) */
  memberSince: string
  verificationStatus: VerificationStatus
  role: 'USER' | 'ADMIN'
  avatarUrl?: string
}

export interface ProfilePatch {
  fullName?: string
  dateOfBirth?: string | null
  gender?: Gender | null
  bio?: string | null
}

/** Một địa chỉ trong sổ địa chỉ (R03 III.6.1.1 (9)) */
export interface DeliveryAddress {
  id: string
  recipientName: string
  phone: string
  province: string
  ward: string
  street: string
  isDefault: boolean
}

export type DeliveryAddressInput = Omit<DeliveryAddress, 'id'>

/** Lần nộp hồ sơ xác minh gần nhất — `null` khi người dùng chưa nộp lần nào */
export interface LatestVerification {
  id: string
  status: Exclude<VerificationStatus, 'unverified'>
  submittedAt: string
  rejectionReason: string | null
  reviewedAt: string | null
  /** Chỉ khi Chờ duyệt: link có hạn tới 3 ảnh đã gửi, để xem lại (chỉ đọc) */
  documents?: { frontImage: string; backImage: string; selfie: string }
}

export async function fetchProfile(): Promise<UserProfile> {
  const { data } = await httpClient.get<ApiResponse<UserProfile>>('/users/profile')
  return data.data
}

/** Backend chỉ cho sửa họ tên, ngày sinh, giới tính, giới thiệu; gửi trường khác sẽ bị từ chối 400 */
export async function updateProfile(patch: ProfilePatch): Promise<UserProfile> {
  const { data } = await httpClient.patch<ApiResponse<UserProfile>>('/users/profile', patch)
  return data.data
}

/** Sổ địa chỉ: địa chỉ mặc định đứng đầu */
export async function fetchAddresses(): Promise<DeliveryAddress[]> {
  const { data } = await httpClient.get<ApiResponse<DeliveryAddress[]>>('/users/addresses')
  return data.data
}

export async function createAddress(input: DeliveryAddressInput): Promise<DeliveryAddress> {
  const { data } = await httpClient.post<ApiResponse<DeliveryAddress>>('/users/addresses', input)
  return data.data
}

export async function updateAddress(id: string, input: Partial<DeliveryAddressInput>): Promise<DeliveryAddress> {
  const { data } = await httpClient.patch<ApiResponse<DeliveryAddress>>(`/users/addresses/${id}`, input)
  return data.data
}

export async function deleteAddress(id: string): Promise<void> {
  await httpClient.delete(`/users/addresses/${id}`)
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

export interface IdentityVerificationPayload {
  idCardNumber: string
  phone: string
  frontImage: File
  backImage: File
  selfie: File
}

/** Gửi hồ sơ CCCD (multipart). Thành công → hồ sơ ở trạng thái chờ duyệt */
export async function submitIdentityVerification(payload: IdentityVerificationPayload): Promise<{ id: string; status: 'pending'; submittedAt: string }> {
  const form = new FormData()
  form.append('idCardNumber', payload.idCardNumber)
  form.append('phone', payload.phone)
  form.append('frontImage', payload.frontImage)
  form.append('backImage', payload.backImage)
  form.append('selfie', payload.selfie)
  const { data } = await httpClient.post<ApiResponse<{ id: string; status: 'pending'; submittedAt: string }>>('/identity-verifications', form, {
    timeout: 90_000,
  })
  return data.data
}

/** Backend trả message tiếng Anh; dịch các mã lỗi người dùng có thể tự khắc phục */
const PROFILE_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem hồ sơ.',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản. Vui lòng đăng nhập lại.',
  FILE_TOO_LARGE: 'Ảnh quá lớn (ảnh đại diện tối đa 2 MB, ảnh CCCD tối đa 8 MB). Hãy chọn ảnh nhỏ hơn.',
  INVALID_IMAGE_TYPE: 'Ảnh không đúng định dạng JPG, PNG hoặc WebP. Hãy chọn ảnh khác.',
  STORAGE_ERROR: 'Máy chủ lưu ảnh chưa sẵn sàng. Vui lòng thử lại sau ít phút.',
  MISSING_REQUIRED_IMAGE: 'Thiếu ảnh. Hãy chọn đủ mặt trước, mặt sau CCCD và ảnh chân dung.',
  ALREADY_VERIFIED: 'Tài khoản đã được xác minh, không cần gửi lại hồ sơ.',
  VERIFICATION_ALREADY_PENDING: 'Bạn đã có hồ sơ đang chờ duyệt. Hãy chờ kết quả trước khi gửi hồ sơ mới.',
  ADDRESS_NOT_FOUND: 'Địa chỉ này không còn trong sổ địa chỉ. Hãy tải lại trang.',
}

export function getProfileErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error)
  return (code && PROFILE_ERROR_MESSAGES[code]) || getApiErrorMessage(error)
}

export function isUnauthorizedError(error: unknown): boolean {
  return getApiErrorCode(error) === 'UNAUTHORIZED'
}
