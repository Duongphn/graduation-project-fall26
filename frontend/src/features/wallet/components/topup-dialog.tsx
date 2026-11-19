import { useMutation } from '@tanstack/react-query'
import { CreditCard, QrCode, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { walletPayosCheckoutPath } from '../../../routes/paths'
import { ApiError } from '../../../services/api-error'
import { formatVnd, vndInputFormatter, vndInputParser } from '../../toy-listings/format-vnd'
import { goToPaymentGateway, rememberTopupReturn, topupAmountError } from '../topup-session'
import { TOPUP_MAX_AMOUNT, TOPUP_MIN_AMOUNT, walletApi, type TopupGateway } from '../wallet-api'
import { WalletDialog } from './wallet-dialog'

const PRESET_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000]

const GATEWAYS: Array<{ value: TopupGateway; label: string; hint: string; icon: LucideIcon; name: string }> = [
  {
    value: 'payos',
    label: 'Chuyển khoản QR',
    hint: 'Quét mã VietQR ngay trên ToyFlow bằng app ngân hàng bất kỳ',
    icon: QrCode,
    name: 'PayOS',
  },
  {
    value: 'vnpay',
    label: 'Thẻ ngân hàng',
    hint: 'Thẻ ATM nội địa, thẻ quốc tế qua cổng VNPay',
    icon: CreditCard,
    name: 'VNPay',
  },
]

/**
 * Tạo giao dịch Pending ở cổng đã chọn. PayOS: trang mã VietQR của ToyFlow (ở lại trong ứng dụng);
 * VNPay: trang thanh toán của VNPay.
 */
const startTopup = async ({ gateway, amount }: { gateway: TopupGateway; amount: number }) =>
  gateway === 'payos'
    ? { inApp: true as const, to: walletPayosCheckoutPath((await walletApi.createPayosTopup(amount)).paymentCode) }
    : { inApp: false as const, to: (await walletApi.createTopup(amount)).paymentUrl }

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
  const [gateway, setGateway] = useState<TopupGateway>('payos')
  const [touched, setTouched] = useState(false)
  const gatewayName = GATEWAYS.find((option) => option.value === gateway)?.name ?? ''
  const navigate = useNavigate()

  const topup = useMutation({
    mutationFn: startTopup,
    onSuccess: ({ inApp, to }) => {
      rememberTopupReturn(returnTo)
      if (inApp) navigate(to)
      else goToPaymentGateway(to)
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
    topup.mutate({ gateway, amount })
  }

  return (
    <WalletDialog
      title="Nạp tiền vào ví"
      subtitle="Tiền vào ví ngay khi thanh toán thành công."
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
        <fieldset>
          <legend className="text-sm font-semibold text-tf-ink">Cách thanh toán</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {GATEWAYS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tf-primary/30 ${
                  gateway === option.value ? 'border-tf-primary bg-tf-primary-fixed' : 'border-tf-surface hover:border-tf-primary'
                }`}
              >
                <input
                  type="radio"
                  name="topup-gateway"
                  value={option.value}
                  checked={gateway === option.value}
                  onChange={() => setGateway(option.value)}
                  className="sr-only"
                />
                <option.icon className="mt-0.5 size-5 shrink-0 text-tf-primary" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold text-tf-ink">{option.label}</span>
                  <span className="block text-xs text-tf-ink-muted">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

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
            ? gateway === 'payos'
              ? 'Đang tạo mã QR…'
              : `Đang chuyển sang ${gatewayName}…`
            : amount && !error
              ? `Nạp ${formatVnd(amount)} qua ${gatewayName}`
              : `Tiếp tục với ${gatewayName}`}
        </button>

        <p className="flex items-start gap-2 text-xs text-tf-ink-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {gateway === 'payos'
            ? 'ToyFlow hiện mã VietQR để bạn quét bằng app ngân hàng; tiền vào ví tự động khi chuyển khoản thành công.'
            : 'Bạn sẽ được chuyển sang trang VNPay để thanh toán.'}{' '}
          Nếu huỷ hoặc thanh toán không thành công, số dư ví không bị trừ.
        </p>
      </form>
    </WalletDialog>
  )
}
