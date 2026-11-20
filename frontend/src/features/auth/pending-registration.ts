import type { OtpChallenge } from './auth-api'
import type { RegisterFormInput } from './auth-schemas'

/**
 * Bước nhập OTP của đăng ký được giữ trong sessionStorage để tải lại trang vẫn ở bước 2.
 * Không lưu mật khẩu: quay lại bước 1 sau khi tải lại thì phải nhập lại mật khẩu.
 */
const KEY = 'toyflow-pending-registration'
/** Server chỉ giữ thông tin đăng ký chờ xác minh 1 giờ kể từ lần gửi mã cuối */
const PENDING_MS = 60 * 60 * 1000

export type RegistrationDraft = Omit<RegisterFormInput, 'password' | 'confirmPassword'>

interface StoredPendingRegistration {
  challenge: OtpChallenge
  draft: RegistrationDraft
  /** Thời điểm gửi mã gần nhất (ms) */
  sentAt: number
}

export interface PendingRegistration {
  challenge: OtpChallenge
  draft: RegisterFormInput
  /** Số giây đã trôi qua từ lần gửi mã gần nhất — để đếm ngược tiếp sau khi tải lại */
  elapsedSeconds: number
}

export function savePendingRegistration(challenge: OtpChallenge, values: RegisterFormInput, sentAt = Date.now()) {
  const draft: RegistrationDraft = {
    fullName: values.fullName,
    phone: values.phone,
    email: values.email,
    acceptTerms: values.acceptTerms,
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ challenge, draft, sentAt } satisfies StoredPendingRegistration))
  } catch {
    // Trình duyệt chặn storage: chỉ mất khả năng giữ bước khi tải lại
  }
}

/** Ghi lại thời điểm gửi mã sau khi "Gửi lại mã" */
export function touchPendingRegistration(sentAt = Date.now()) {
  const stored = readStored()
  if (!stored) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...stored, sentAt }))
  } catch {
    // Như savePendingRegistration
  }
}

export function loadPendingRegistration(): PendingRegistration | null {
  const stored = readStored()
  if (!stored) return null
  const elapsed = Date.now() - stored.sentAt
  if (elapsed < 0 || elapsed > PENDING_MS) {
    clearPendingRegistration()
    return null
  }
  return {
    challenge: stored.challenge,
    draft: { ...stored.draft, password: '', confirmPassword: '' },
    elapsedSeconds: Math.floor(elapsed / 1000),
  }
}

export function clearPendingRegistration() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Không có storage thì cũng không có gì để xoá
  }
}

function readStored(): StoredPendingRegistration | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredPendingRegistration>
    return typeof value.challenge?.email === 'string' && typeof value.sentAt === 'number' && value.draft
      ? (value as StoredPendingRegistration)
      : null
  } catch {
    return null
  }
}
