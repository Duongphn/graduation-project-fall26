import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { formatVnd } from '../features/toy-listings/format-vnd'
import { clearTopupReturn, readTopupReturn } from '../features/wallet/topup-session'
import { walletApi, type TopupResult } from '../features/wallet/wallet-api'
import { myWalletQuery, walletKeys } from '../features/wallet/wallet-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'
import { ApiError } from '../services/api-error'

interface ResultView {
  icon: LucideIcon
  tone: string
  title: string
  description: string
}

const FAILED_TONE = 'bg-red-50 text-red-700'

function viewOf(result: TopupResult, balance: number | undefined): ResultView {
  switch (result.status) {
    case 'success':
      return {
        icon: CheckCircle2,
        tone: 'bg-emerald-50 text-emerald-700',
        title: result.amount !== undefined ? `Đã nạp ${formatVnd(result.amount)} vào ví` : 'Nạp tiền thành công',
        description: balance !== undefined ? `Số dư khả dụng hiện tại: ${formatVnd(balance)}.` : result.message,
      }
    case 'cancelled':
      return {
        icon: XCircle,
        tone: FAILED_TONE,
        title: 'Bạn đã huỷ giao dịch nạp tiền',
        description: 'Không có khoản tiền nào bị trừ. Bạn có thể nạp lại bất cứ lúc nào.',
      }
    case 'failed':
      return {
        icon: XCircle,
        tone: FAILED_TONE,
        title: 'Nạp tiền không thành công',
        description: 'Giao dịch bị từ chối hoặc đã quá hạn. Số dư ví không thay đổi.',
      }
    default:
      // invalid_checksum, not_found: link bị sửa hoặc không có giao dịch
      return {
        icon: XCircle,
        tone: FAILED_TONE,
        title: 'Không xác nhận được giao dịch',
        description: result.message,
      }
  }
}

/**
 * VNPay chuyển về đây kèm ?vnp_…&vnp_SecureHash=… (UC17). Trang gửi nguyên query cho server
 * (GET /payments/vnpay-return) kiểm tra chữ ký và ghi nhận kết quả, rồi hiển thị thành công / huỷ / thất bại.
 */
export function WalletTopupResultPage() {
  const { search } = useLocation()
  const queryClient = useQueryClient()
  const hasVnpayParams = new URLSearchParams(search).has('vnp_TxnRef')
  // Đọc một lần: trang cần quay lại (vd. đơn thuê đang chờ thanh toán)
  const [returnTo] = useState(readTopupReturn)

  const result = useQuery({
    queryKey: ['wallet-topup-return', search],
    queryFn: () => walletApi.confirmVnpayReturn(search),
    enabled: hasVnpayParams,
    retry: false,
    staleTime: Infinity,
  })
  const status = result.data?.status
  // Số dư mới sau khi nạp thành công (server không trả kèm kết quả)
  const wallet = useQuery({ ...myWalletQuery, enabled: status === 'success' })

  useEffect(() => {
    document.title = 'Kết quả nạp tiền | ToyFlow'
  }, [])

  useEffect(() => {
    if (status === 'success' || status === 'failed' || status === 'cancelled') {
      void queryClient.invalidateQueries({ queryKey: walletKeys.me })
    }
  }, [queryClient, status])

  const view: ResultView | undefined = !hasVnpayParams
    ? {
        icon: XCircle,
        tone: 'bg-tf-surface text-tf-ink-muted',
        title: 'Không tìm thấy giao dịch',
        description: 'Đường dẫn này không có thông tin giao dịch từ VNPay. Kiểm tra số dư trong ví của bạn.',
      }
    : result.isError
      ? {
          icon: XCircle,
          tone: FAILED_TONE,
          title: 'Không xác nhận được giao dịch',
          description:
            result.error instanceof ApiError
              ? result.error.message
              : 'Không kết nối được máy chủ. Vui lòng thử lại.',
        }
      : result.data
        ? viewOf(result.data, wallet.data?.availableBalance)
        : undefined

  return (
    <AccountLayout activeItem="wallet">
      <section
        aria-live="polite"
        className="mx-auto mt-6 max-w-lg rounded-2xl border border-tf-surface bg-white p-6 text-center sm:p-8"
      >
        {!view ? (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-tf-primary" aria-hidden />
            <h1 className="mt-4 text-lg font-bold text-tf-ink">Đang xác nhận giao dịch với VNPay…</h1>
            <p className="mt-1 text-sm text-tf-ink-muted">Vui lòng không đóng trang.</p>
          </>
        ) : (
          <>
            <span className={`mx-auto grid size-14 place-items-center rounded-full ${view.tone}`}>
              <view.icon className="size-7" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold text-tf-ink">{view.title}</h1>
            <p className="mt-2 text-sm text-tf-ink-muted">{view.description}</p>
            {result.data?.paymentCode && (
              <p className="mt-3 text-xs text-tf-ink-muted">Mã giao dịch: {result.data.paymentCode}</p>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {status === 'success' && returnTo && (
                <Link
                  to={returnTo}
                  onClick={clearTopupReturn}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container"
                >
                  Quay lại thanh toán đơn thuê
                </Link>
              )}
              <Link
                to={PATHS.wallet}
                className="inline-flex h-10 items-center justify-center rounded-full border border-tf-surface px-5 text-sm font-semibold text-tf-primary hover:border-tf-primary"
              >
                Về ví ToyFlow
              </Link>
            </div>
          </>
        )}
      </section>
    </AccountLayout>
  )
}
