import { Progress } from 'antd'
import { getPasswordStrength, PASSWORD_MIN_LENGTH } from '../auth-schemas'

const STRENGTH_LEVELS = [
  { label: '', color: '' },
  { label: 'Yếu', color: '#ef4444' },
  { label: 'Trung bình', color: '#f59e0b' },
  { label: 'Mạnh', color: '#10b981' },
] as const

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password)
  const level = STRENGTH_LEVELS[strength]

  return (
    <div className="password-strength">
      <Progress
        steps={3}
        percent={(strength / 3) * 100}
        strokeColor={level.color || undefined}
        showInfo={false}
        size={{ height: 4 }}
        className="password-strength__bar"
        aria-hidden
      />
      <span className="password-strength__label" aria-live="polite">
        {strength ? level.label : `${PASSWORD_MIN_LENGTH}+ ký tự`}
      </span>
    </div>
  )
}
