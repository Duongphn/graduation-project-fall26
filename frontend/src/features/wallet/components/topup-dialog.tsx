import { useMutation } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import { ApiError } from '../../../services/api-error'
import { formatVnd, vndInputFormatter, vndInputParser } from '../../toy-listings/format-vnd'
import { goToPaymentGateway, rememberTopupReturn, topupAmountError } from '../topup-session'
import { TOPUP_MAX_AMOUNT, TOPUP_MIN_AMOUNT, walletApi } from '../wallet-api'
import { WalletDialog } from './wallet-dialog'

const PRESET_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000]

interface TopupDialogProps {
  onClose: () => void
  /** Số tiền điền sẵn (vd. số còn thiếu khi thanh toán đơn thuê) */
  initialAmount?: number
  /** Trang quay lại sau khi nạp xong */
  returnTo?: string
}

/**
 * Nạp tiền vào ví qua VNPay (UC17): chọn hoặc nhập số tiền → server tạo giao dịch Pending và trả
 * link VNPay → chuyển trang. Kết quả hiện ở /wallet/topup/result khi VNPay chuyển về.
 */
export function TopupDialog({ onClose, initialAmount, returnTo }: TopupDialogProps) {
  const inputId = useId()
  const errorId = useId()
  const [amount, setAmount] = useState<number | undefined>(initialAmount)
  const [touched, setTouched] = useState(false)

  const topup = useMutation({
    mutationFn: (value: number) => walletApi.createTopup(value),
    onSuccess: ({ paymentUrl }) => {
      rememberTopupReturn(returnTo)
      goToPaymentGateway(paymentUrl)
    },
  })
  // Đã có link VNPay: giữ trạng thái "đang chuyển" tới khi trình duyệt rời trang
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
      subtitle="Thanh toán qua cổng VNPay, tiền vào ví ngay khi thành công."
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
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
          {busy
            ? 'Đang chuyển sang VNPay…'
            : amount && !error
              ? `Nạp ${formatVnd(amount)} qua VNPay`
              : 'Tiếp tục với VNPay'}
        </button>

        <p className="flex items-start gap-2 text-xs text-tf-ink-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Bạn sẽ được chuyển sang trang VNPay để thanh toán. Nếu huỷ hoặc thanh toán không thành công, số dư ví
          không bị trừ.
        </p>
      </form>
    </WalletDialog>
  )
}
