import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Landmark, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { ApiError } from '../../../services/api-error'
import { formatVnd, vndInputFormatter, vndInputParser } from '../../toy-listings/format-vnd'
import { WITHDRAWAL_MAX_AMOUNT, WITHDRAWAL_MIN_AMOUNT, walletApi, type WithdrawalRequest } from '../wallet-api'
import { walletKeys } from '../wallet-queries'
import {
  BANK_OPTIONS,
  maskAccountNumber,
  maxWithdrawableAmount,
  toAccountHolderName,
  validateWithdrawalForm,
  type WithdrawalFieldErrors,
  type WithdrawalFormValues,
} from '../withdrawal-form'

const inputClass = (invalid: boolean) =>
  `mt-1 h-11 w-full rounded-lg border bg-white px-3 text-base text-tf-ink outline-none focus:ring-2 focus:ring-tf-primary/30 ${
    invalid ? 'border-red-500' : 'border-tf-outline'
  }`

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error: string | undefined
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-tf-ink">
        {label}
      </label>
      {children}
      {(error ?? hint) && (
        <p id={`${id}-help`} className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-tf-ink-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

interface WithdrawDialogProps {
  availableBalance: number
  onClose: () => void
  /** Gọi khi tạo lệnh thành công (trang hiện lệnh đang chờ) */
  onCreated: (withdrawal: WithdrawalRequest) => void
}

/**
 * Yêu cầu rút tiền (UC18): nhập số tiền + tài khoản ngân hàng → kiểm tra số dư và hạn mức → xác
 * nhận → server tạo lệnh Pending và tạm trừ số dư khả dụng.
 */
export function WithdrawDialog({ availableBalance, onClose, onCreated }: WithdrawDialogProps) {
  const titleId = useId()
  const ids = { amount: useId(), bank: useId(), account: useId(), holder: useId() }
  const amountRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [values, setValues] = useState<WithdrawalFormValues>({
    amount: undefined,
    bankName: '',
    accountNumber: '',
    accountHolderName: '',
  })
  const [errors, setErrors] = useState<WithdrawalFieldErrors>({})

  const withdraw = useMutation({
    mutationFn: (input: WithdrawalFormValues) =>
      walletApi.createWithdrawal({
        amount: input.amount ?? 0,
        bankInfo: {
          bankName: input.bankName.trim(),
          accountNumber: input.accountNumber.trim(),
          accountHolderName: input.accountHolderName.trim(),
        },
      }),
    onSuccess: async (withdrawal) => {
      // Số dư, lịch sử và danh sách lệnh rút đều nằm dưới walletKeys.me
      await queryClient.invalidateQueries({ queryKey: walletKeys.me })
      onCreated(withdrawal)
    },
  })

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !withdraw.isPending) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, withdraw.isPending])

  const set = <K extends keyof WithdrawalFormValues>(key: K, value: WithdrawalFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const goToConfirm = (event: FormEvent) => {
    event.preventDefault()
    const found = validateWithdrawalForm(values, availableBalance)
    setErrors(found)
    if (Object.keys(found).length === 0) {
      withdraw.reset()
      setStep('confirm')
    }
  }

  const serverError = withdraw.error
    ? withdraw.error instanceof ApiError
      ? withdraw.error.message
      : 'Không tạo được lệnh rút tiền. Vui lòng thử lại.'
    : undefined
  const tooLow = availableBalance < WITHDRAWAL_MIN_AMOUNT

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Đóng hộp rút tiền"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => !withdraw.isPending && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-tf-ink">
              {step === 'form' ? 'Rút tiền về ngân hàng' : 'Xác nhận rút tiền'}
            </h2>
            <p className="mt-1 text-sm text-tf-ink-muted">
              Số dư khả dụng: <strong className="text-tf-ink tabular-nums">{formatVnd(availableBalance)}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={withdraw.isPending}
            aria-label="Đóng"
            className="grid size-9 shrink-0 place-items-center rounded-full text-tf-ink-muted hover:bg-tf-surface disabled:opacity-50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {step === 'form' ? (
          <form onSubmit={goToConfirm} noValidate className="mt-4 flex flex-col gap-4">
            {tooLow && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Số dư khả dụng chưa đủ mức rút tối thiểu {formatVnd(WITHDRAWAL_MIN_AMOUNT)}.
              </p>
            )}

            <Field
              id={ids.amount}
              label="Số tiền rút"
              error={errors.amount}
              hint={`Từ ${formatVnd(WITHDRAWAL_MIN_AMOUNT)} đến ${formatVnd(WITHDRAWAL_MAX_AMOUNT)} mỗi lần.`}
            >
              <div className="flex gap-2">
                <input
                  ref={amountRef}
                  id={ids.amount}
                  inputMode="numeric"
                  autoComplete="off"
                  value={vndInputFormatter(values.amount)}
                  onChange={(event) => {
                    const amount = vndInputParser(event.target.value)
                    set('amount', amount === 0 ? undefined : amount)
                  }}
                  aria-invalid={Boolean(errors.amount)}
                  aria-describedby={`${ids.amount}-help`}
                  placeholder="Ví dụ: 500.000"
                  className={`${inputClass(Boolean(errors.amount))} font-semibold tabular-nums`}
                />
                <button
                  type="button"
                  onClick={() => set('amount', maxWithdrawableAmount(availableBalance))}
                  disabled={tooLow}
                  className="mt-1 h-11 shrink-0 rounded-lg border border-tf-surface px-3 text-sm font-semibold text-tf-primary hover:border-tf-primary disabled:opacity-50"
                >
                  Rút tối đa
                </button>
              </div>
            </Field>

            <Field id={ids.bank} label="Ngân hàng" error={errors.bankName}>
              <select
                id={ids.bank}
                value={values.bankName}
                onChange={(event) => set('bankName', event.target.value)}
                aria-invalid={Boolean(errors.bankName)}
                aria-describedby={`${ids.bank}-help`}
                className={inputClass(Boolean(errors.bankName))}
              >
                <option value="">Chọn ngân hàng</option>
                {BANK_OPTIONS.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </Field>

            <Field id={ids.account} label="Số tài khoản" error={errors.accountNumber}>
              <input
                id={ids.account}
                inputMode="numeric"
                autoComplete="off"
                value={values.accountNumber}
                onChange={(event) => set('accountNumber', event.target.value.replace(/\D/g, '').slice(0, 25))}
                aria-invalid={Boolean(errors.accountNumber)}
                aria-describedby={`${ids.account}-help`}
                className={`${inputClass(Boolean(errors.accountNumber))} tabular-nums`}
              />
            </Field>

            <Field
              id={ids.holder}
              label="Tên chủ tài khoản"
              error={errors.accountHolderName}
              hint="Viết hoa không dấu, đúng như trên thẻ ngân hàng."
            >
              <input
                id={ids.holder}
                autoComplete="off"
                value={values.accountHolderName}
                onChange={(event) => set('accountHolderName', toAccountHolderName(event.target.value))}
                aria-invalid={Boolean(errors.accountHolderName)}
                aria-describedby={`${ids.holder}-help`}
                placeholder="NGUYEN VAN A"
                className={`${inputClass(Boolean(errors.accountHolderName))} uppercase`}
              />
            </Field>

            <button
              type="submit"
              disabled={tooLow}
              className="inline-flex h-11 items-center justify-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
            >
              Tiếp tục
            </button>
          </form>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <dl className="divide-y divide-tf-surface rounded-xl border border-tf-surface text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Số tiền rút</dt>
                <dd className="font-bold text-tf-ink tabular-nums">{formatVnd(values.amount ?? 0)}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Ngân hàng</dt>
                <dd className="text-right font-semibold text-tf-ink">{values.bankName}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Số tài khoản</dt>
                <dd className="font-semibold text-tf-ink tabular-nums">{maskAccountNumber(values.accountNumber)}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Chủ tài khoản</dt>
                <dd className="text-right font-semibold text-tf-ink">{values.accountHolderName.trim()}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Số dư khả dụng sau khi tạo lệnh</dt>
                <dd className="font-semibold text-tf-ink tabular-nums">
                  {formatVnd(availableBalance - (values.amount ?? 0))}
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 text-xs text-tf-ink-muted">
              <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden />
              Số tiền được tạm trừ khỏi số dư khả dụng ngay khi tạo lệnh. ToyFlow chuyển khoản về tài khoản trên sau khi
              duyệt; nếu lệnh bị từ chối, tiền được hoàn lại vào ví.
            </p>

            {serverError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {serverError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={withdraw.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-tf-surface px-5 text-sm font-semibold text-tf-ink hover:border-tf-primary disabled:opacity-60"
              >
                <ArrowLeft className="size-4" aria-hidden /> Sửa thông tin
              </button>
              <button
                type="button"
                onClick={() => withdraw.mutate(values)}
                disabled={withdraw.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
              >
                {withdraw.isPending ? 'Đang tạo lệnh…' : 'Xác nhận rút tiền'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
