import { useMutation } from '@tanstack/react-query'
import { QrCode, ShieldCheck } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { walletPayosCheckoutPath } from '../../../routes/paths'
import { ApiError } from '../../../services/api-error'
import { formatVnd, vndInputFormatter, vndInputParser } from '../../toy-listings/format-vnd'
import { rememberTopupReturn, topupAmountError } from '../topup-session'
import { TOPUP_MAX_AMOUNT, TOPUP_MIN_AMOUNT, walletApi } from '../wallet-api'
import { WalletDialog } from './wallet-dialog'

const PRESET_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000]

/** Tạo giao dịch PayOS Pending, trả về trang mã VietQR của ToyFlow (ở lại trong ứng dụng) */
const startTopup = async (amount: number) =>
  walletPayosCheckoutPath((await walletApi.createPayosTopup(amount)).paymentCode)

interface TopupDialogProps {
  onClose: () => void
  /** Số tiền điền sẵn (vd. số còn thiếu khi thanh toán đơn thuê) */
  initialAmount?: number
  /** Trang quay lại sau khi nạp xong */
  returnTo?: string
}

/**
 * Nạp tiền vào ví bằng chuyển khoản QR qua PayOS (UC17): chọn hoặc nhập số tiền → server tạo giao
 * dịch Pending → sang trang mã VietQR của ToyFlow; tiền vào ví khi PayOS báo đã nhận chuyển khoản.
 */
export function TopupDialog({ onClose, initialAmount, returnTo }: TopupDialogProps) {
  const inputId = useId()
  const errorId = useId()
  const [amount, setAmount] = useState<number | undefined>(initialAmount)
  const [touched, setTouched] = useState(false)
  const navigate = useNavigate()

  const topup = useMutation({
    mutationFn: startTopup,
    onSuccess: (checkoutPath) => {
      rememberTopupReturn(returnTo)
      navigate(checkoutPath)
    },
  })
  // Đã có mã QR: giữ trạng thái "đang tạo" tới khi chuyển sang trang QR
  const busy = topup.isPending || topup.isSuccess

  const error = topupAmountError(amount)
  const showError = touched && error !== undefined
  const serverError = topup.error
    ? topup.error instanceof ApiError
      ? topup.error.message
      : 'Không tạo được giao dịch nạp tiền. Vui lòng thử lại.'
    : undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (error || amount === undefined || busy) return
    topup.mutate(amount)
  }

  return (
    <WalletDialog
      title="Nạp tiền vào ví"
      subtitle="Tiền vào ví ngay khi thanh toán thành công."
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
        <p className="flex items-start gap-3 rounded-xl border border-tf-surface bg-tf-primary-fixed p-3">
          <QrCode className="mt-0.5 size-5 shrink-0 text-tf-primary" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-tf-ink">Chuyển khoản QR qua PayOS</span>
            <span className="block text-xs text-tf-ink-muted">Quét mã VietQR ngay trên ToyFlow bằng app ngân hàng bất kỳ</span>
          </span>
        </p>

        <div role="group" aria-label="Số tiền gợi ý" className="grid grid-cols-3 gap-2">
          {PRESET_AMOUNTS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={amount === preset}
              onClick={() => {
                setAmount(preset)
                setTouched(false)
              }}
              className={`h-10 rounded-lg border text-sm font-semibold tabular-nums transition-colors ${
                amount === preset
                  ? 'border-tf-primary bg-tf-primary-fixed text-tf-primary'
                  : 'border-tf-surface text-tf-ink hover:border-tf-primary'
              }`}
            >
              {formatVnd(preset)}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor={inputId} className="text-sm font-semibold text-tf-ink">
            Số tiền nạp
          </label>
          <div
            className={`mt-1 flex h-11 items-center rounded-lg border bg-white px-3 focus-within:ring-2 focus-within:ring-tf-primary/30 ${
              showError ? 'border-red-500' : 'border-tf-outline'
            }`}
          >
            <input
              id={inputId}
              inputMode="numeric"
              autoComplete="off"
              value={vndInputFormatter(amount)}
              onChange={(event) => {
                const value = vndInputParser(event.target.value)
                setAmount(value === 0 ? undefined : value)
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={showError}
              aria-describedby={errorId}
              placeholder="Ví dụ: 200.000"
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-tf-ink tabular-nums outline-none placeholder:font-normal placeholder:text-tf-ink-muted"
            />
            <span className="text-sm text-tf-ink-muted">₫</span>
          </div>
          <p id={errorId} className={`mt-1 text-xs ${showError ? 'text-red-600' : 'text-tf-ink-muted'}`}>
            {showError
              ? error
              : `Từ ${formatVnd(TOPUP_MIN_AMOUNT)} đến ${formatVnd(TOPUP_MAX_AMOUNT)} mỗi lần.`}
          </p>
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center justify-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
        >
          {busy ? 'Đang tạo mã QR…' : amount && !error ? `Nạp ${formatVnd(amount)} qua PayOS` : 'Tiếp tục với PayOS'}
        </button>

        <p className="flex items-start gap-2 text-xs text-tf-ink-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          ToyFlow hiện mã VietQR để bạn quét bằng app ngân hàng; tiền vào ví tự động khi chuyển khoản thành công. Nếu
          huỷ hoặc thanh toán không thành công, số dư ví không bị trừ.
        </p>
      </form>
    </WalletDialog>
  )
}
