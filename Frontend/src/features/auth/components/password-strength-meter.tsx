import { getPasswordStrength, PASSWORD_MIN_LENGTH } from '../auth-schemas'

const STRENGTH_LABELS = ['', 'Yếu', 'Trung bình', 'Mạnh'] as const
const STRENGTH_MODIFIERS = ['', 'weak', 'medium', 'strong'] as const


export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password)

  return (
    <div className={`password-strength password-strength--${STRENGTH_MODIFIERS[strength] || 'empty'}`}>
      <div className="password-strength__bars" aria-hidden>
        {[1, 2, 3].map((level) => (
          <span
            key={level}
            className={`password-strength__bar ${level <= strength ? 'password-strength__bar--filled' : ''}`}
          />
        ))}
      </div>
      {/* aria-live để trình đọc màn hình thông báo khi độ mạnh thay đổi */}
      <span className="password-strength__label" aria-live="polite">
        {strength ? STRENGTH_LABELS[strength] : `${PASSWORD_MIN_LENGTH}+ ký tự`}
      </span>
    </div>
  )
}
