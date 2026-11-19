import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Clock, Download, ExternalLink, Home, Loader2, ScanLine, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { formatVnd } from '../features/toy-listings/format-vnd'
import { bankOfBin } from '../features/wallet/bank-bins'
import { CopyField } from '../features/wallet/components/copy-field'
import { VietQrImage } from '../features/wallet/components/vietqr-image'
import { formatCountdown, useCountdown } from '../features/wallet/use-countdown'
import { downloadVietQr } from '../features/wallet/vietqr-download'
import { walletApi } from '../features/wallet/wallet-api'
import { walletTopupLink } from '../features/wallet/topup-session'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS, walletPayosResultPath } from '../routes/paths'
import { ApiError, getErrorMessage } from '../services/api-error'

/** Hỏi lại server (server hỏi PayOS) xem tiền đã về chưa */
const STATUS_POLL_MS = 4_000

/**
 * Nạp tiền bằng chuyển khoản (UC17, PayOS): ToyFlow tự hiện mã VietQR và thông tin chuyển khoản,
 * người dùng không phải rời sang trang PayOS. Trang hỏi trạng thái mỗi vài giây; khi tiền về
 * (hoặc giao dịch bị huỷ, hết hạn) thì chuyển sang trang kết quả.
 */
export function WalletPayosCheckoutPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const checkout = useQuery({
    queryKey: ['wallet-payos-checkout', code],
    queryFn: () => walletApi.getPayosCheckout(code),
    enabled: /^\d+$/.test(code),
    retry: false,
    staleTime: Infinity,
  })
  const remaining = useCountdown(checkout.data?.expiresAt)
  const expired = remaining === 0
  const waiting = checkout.data?.status === 'pending' && !expired

  const status = useQuery({
    queryKey: ['wallet-payos-status', code],
    queryFn: () => walletApi.confirmPayosReturn(code),
    enabled: waiting,
    refetchInterval: STATUS_POLL_MS,
    retry: false,
  })

  const cancel = useMutation({ mutationFn: () => walletApi.cancelPayosTopup(code) })
  const [saveFailed, setSaveFailed] = useState(false)
  const saveQr = (qrCode: string) => {
    setSaveFailed(false)
    downloadVietQr(qrCode, `toyflow-nap-vi-${code}.png`).catch(() => setSaveFailed(true))
  }

  useEffect(() => {
    document.title = 'Chuyển khoản nạp ví | ToyFlow'
  }, [])

  // Đã có kết quả cuối (tiền về, bị huỷ, hết hạn): sang trang kết quả
  const finalStatus =
    cancel.data?.status ??
    (status.data && status.data.status !== 'pending' ? status.data.status : undefined) ??
    (checkout.data && checkout.data.status !== 'pending' ? checkout.data.status : undefined)
  useEffect(() => {
    if (finalStatus) navigate(walletPayosResultPath(code), { replace: true })
  }, [code, finalStatus, navigate])

  const data = checkout.data
  const bank = data ? bankOfBin(data.bankBin) : undefined
  const validCode = /^\d+$/.test(code)
  const notFound =
    !validCode || (checkout.isError && checkout.error instanceof ApiError && checkout.error.status === 404)
  const loadError = checkout.isError && !notFound

  return (
    <AccountLayout activeItem="wallet">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-tf-ink-muted">
        <Link to={PATHS.home} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-tf-primary">
          <Home className="size-3.5" aria-hidden /> Trang chủ
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Link to={PATHS.wallet} className="shrink-0 whitespace-nowrap hover:text-tf-primary">
          Ví ToyFlow
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <span aria-current="page" className="min-w-0 truncate font-medium text-tf-ink">
          Nạp tiền bằng chuyển khoản
        </span>
      </nav>

      {checkout.isLoading && (
        <div aria-hidden className="mx-auto mt-6 h-96 max-w-3xl animate-pulse rounded-2xl bg-tf-surface" />
      )}

      {loadError && (
        <div className="mx-auto mt-6 max-w-3xl">
          <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            {getErrorMessage(checkout.error, 'Không tải được thông tin chuyển khoản.')}
            <button
              type="button"
              onClick={() => void checkout.refetch()}
              className="inline-flex h-9 items-center self-start rounded-full border border-red-200 bg-white px-4 font-semibold hover:border-red-400 sm:self-auto"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {notFound && (
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
          <p className="font-semibold text-tf-ink">Không tìm thấy giao dịch nạp tiền.</p>
          <Link to={PATHS.wallet} className="mt-3 inline-block text-sm font-semibold text-tf-primary hover:underline">
            Về ví ToyFlow
          </Link>
        </div>
      )}

      {data && bank && (
        <section
          aria-labelledby="payos-checkout-title"
          className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl border border-tf-surface bg-white"
        >
          <header className="flex flex-col gap-3 border-b border-tf-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h1 id="payos-checkout-title" className="text-lg font-bold text-balance text-tf-ink sm:text-xl">
                Chuyển khoản {formatVnd(data.amount)} để nạp ví
              </h1>
              <p className="mt-0.5 text-sm text-tf-ink-muted">Tiền vào ví tự động ngay khi ngân hàng báo đã nhận.</p>
            </div>
            {remaining !== undefined && (
              <span
                className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-sm font-semibold tabular-nums sm:self-auto ${
                  expired ? 'bg-red-50 text-red-700' : remaining < 60_000 ? 'bg-amber-50 text-amber-800' : 'bg-tf-primary-fixed text-tf-primary'
                }`}
              >
                <Clock className="size-4" aria-hidden />
                {expired ? 'Đã hết hạn' : `Còn ${formatCountdown(remaining)}`}
              </span>
            )}
          </header>

          {expired ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <AlertTriangle className="size-10 text-amber-600" aria-hidden />
              <p className="font-semibold text-tf-ink">Mã QR đã hết hạn</p>
              <p className="max-w-sm text-sm text-tf-ink-muted">
                Đừng chuyển khoản theo mã này nữa. Nếu bạn đã chuyển trước khi hết hạn, tiền vẫn được cộng vào ví sau ít
                phút.
              </p>
              <Link
                to={walletTopupLink(PATHS.wallet, data.amount)}
                className="mt-2 inline-flex h-10 items-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container"
              >
                Tạo mã mới
              </Link>
            </div>
          ) : (
            <div className="grid gap-8 px-5 py-6 sm:grid-cols-[minmax(0,15rem)_1fr] sm:px-8">
              <div className="flex flex-col items-center gap-3">
                <div className="aspect-square w-full max-w-60 rounded-2xl border border-tf-surface bg-white p-3 shadow-sm">
                  <VietQrImage value={data.qrCode} label={`Mã VietQR chuyển ${formatVnd(data.amount)} tới ${bank.shortName}`} />
                </div>
                <button
                  type="button"
                  onClick={() => saveQr(data.qrCode)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tf-surface px-4 text-xs font-semibold text-tf-primary hover:border-tf-primary"
                >
                  <Download className="size-3.5" aria-hidden /> Lưu ảnh mã QR
                </button>
                {saveFailed && <p className="text-xs text-red-700">Không lưu được ảnh. Hãy chụp màn hình mã QR.</p>}
                <ol className="w-full max-w-60 space-y-1.5 text-xs text-tf-ink-muted">
                  <li className="flex items-start gap-2">
                    <Smartphone className="mt-0.5 size-3.5 shrink-0 text-tf-primary" aria-hidden /> Mở app ngân hàng bất kỳ
                  </li>
                  <li className="flex items-start gap-2">
                    <ScanLine className="mt-0.5 size-3.5 shrink-0 text-tf-primary" aria-hidden /> Quét mã QR (trên điện thoại:
                    lưu ảnh rồi chọn quét ảnh trong app) và xác nhận chuyển
                  </li>
                </ol>
              </div>

              <div>
                <dl className="divide-y divide-tf-surface">
                  <div className="py-3">
                    <dt className="text-xs text-tf-ink-muted">Ngân hàng</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-tf-ink">
                      {bank.shortName} <span className="font-normal text-tf-ink-muted">· {bank.name}</span>
                    </dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-xs text-tf-ink-muted">Chủ tài khoản</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-tf-ink">{data.accountName}</dd>
                  </div>
                  <CopyField label="Số tài khoản" value={data.accountNumber} />
                  <CopyField label="Số tiền" value={String(data.amount)} emphasis>
                    {formatVnd(data.amount)}
                  </CopyField>
                  <CopyField label="Nội dung chuyển khoản" value={data.description} emphasis />
                </dl>

                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Nếu chuyển khoản thủ công, hãy nhập đúng số tiền và nội dung ở trên để tiền vào ví tự động.
                </p>
              </div>
            </div>
          )}

          {!expired && (
            <footer className="flex flex-col gap-3 border-t border-tf-surface bg-tf-surface/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p aria-live="polite" className="flex items-center gap-2 text-sm text-tf-ink-muted">
                {waiting && (
                  <>
                    <Loader2 className="size-4 animate-spin text-tf-primary" aria-hidden />
                    Đang chờ tiền về… trang tự cập nhật.
                  </>
                )}
                {cancel.isError && <span className="text-red-700">Không huỷ được giao dịch. Vui lòng thử lại.</span>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={data.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-tf-ink-muted hover:text-tf-primary"
                >
                  Mở trang PayOS <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {waiting && (
                  <button
                    type="button"
                    onClick={() => cancel.mutate()}
                    disabled={cancel.isPending}
                    className="inline-flex h-9 items-center rounded-full border border-tf-surface bg-white px-4 text-sm font-semibold text-tf-ink hover:border-red-300 hover:text-red-700 disabled:opacity-60"
                  >
                    {cancel.isPending ? 'Đang huỷ…' : 'Huỷ giao dịch'}
                  </button>
                )}
              </div>
            </footer>
          )}
        </section>
      )}
    </AccountLayout>
  )
}
