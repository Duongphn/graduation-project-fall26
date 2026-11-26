import {
  walletTransactionDirections,
  walletTransactionTypes,
  type WalletTransactionDirection,
  type WalletTransactionType,
} from '../wallet-api'
import { WALLET_DIRECTION_LABELS, WALLET_TYPE_LABELS } from '../wallet-display'

interface ChipGroupProps<T extends string> {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T | undefined
  onChange: (value: T | undefined) => void
}

function ChipGroup<T extends string>({ label, options, labels, value, onChange }: ChipGroupProps<T>) {
  const chip = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
      active
        ? 'border-tf-primary bg-tf-primary text-white'
        : 'border-tf-surface bg-white text-tf-ink-muted hover:border-tf-primary hover:text-tf-primary'
    }`

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={value === undefined} className={chip(value === undefined)} onClick={() => onChange(undefined)}>
        Tất cả
      </button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={chip(value === option)}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

interface WalletHistoryFiltersProps {
  type: WalletTransactionType | undefined
  direction: WalletTransactionDirection | undefined
  onTypeChange: (type: WalletTransactionType | undefined) => void
  onDirectionChange: (direction: WalletTransactionDirection | undefined) => void
}

/** Lọc lịch sử theo loại giao dịch và chiều tiền (vào / ra) */
export function WalletHistoryFilters({ type, direction, onTypeChange, onDirectionChange }: WalletHistoryFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <ChipGroup
        label="Loại giao dịch"
        options={walletTransactionTypes}
        labels={WALLET_TYPE_LABELS}
        value={type}
        onChange={onTypeChange}
      />
      <ChipGroup
        label="Tiền vào hoặc tiền ra"
        options={walletTransactionDirections}
        labels={WALLET_DIRECTION_LABELS}
        value={direction}
        onChange={onDirectionChange}
      />
    </div>
  )
}
