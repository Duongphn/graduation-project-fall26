import type { ReactNode } from 'react'
import { vndInputFormatter } from '../format-vnd'

export function RequiredMark() {
  return <span className="tf-required"> *</span>
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="tf-field-error" role="alert">
      {message}
    </p>
  )
}

export function SectionTitle({ icon, children, size = 'md' }: { icon: ReactNode; children: ReactNode; size?: 'md' | 'sm' }) {
  return (
    <h2 className={`tf-section-title tf-section-title--${size}`}>
      <span className="tf-section-title__icon">{icon}</span>
      {children}
    </h2>
  )
}

interface MoneyInputProps {
  id: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  onBlur: () => void
  unit: string
  tone?: 'primary' | 'plain' | 'tertiary'
  invalid?: boolean
}

/** Ô nhập tiền hiển thị "45.000", lưu giá trị số nguyên */
export function MoneyInput({ id, value, onChange, onBlur, unit, tone = 'plain', invalid }: MoneyInputProps) {
  return (
    <div className="tf-affix-input">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`tf-input tf-input--money tf-input--${tone} ${invalid ? 'is-invalid' : ''}`}
        value={vndInputFormatter(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '')
          onChange(digits ? Number(digits) : undefined)
        }}
        onBlur={onBlur}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      <span className="tf-affix-input__unit">{unit}</span>
    </div>
  )
}
