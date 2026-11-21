import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck } from 'lucide-react'
import { useId, useState } from 'react'

import { getErrorMessage } from '../../../services/api-error'
import { formatVnd } from '../../toy-listings/format-vnd'
import { WalletDialog } from '../../wallet/components/wallet-dialog'
import { walletKeys } from '../../wallet/wallet-queries'
import { purchaseApi, type PurchaseOrder } from '../purchase-api'
import { purchaseKeys } from '../purchase-queries'

/**
 * UC13 người mua: kiểm tra món đồ rồi bấm "Đã nhận & hài lòng" → POST /purchase-orders/:id/receive.
 * Server chuyển tiền ký quỹ cho người bán (trừ hoa hồng), đơn Completed, tin chuyển sang đã bán.
 * Bước này không hoàn tác được nên phải tick xác nhận và qua hộp thoại.
 */
export function ReceiveOrderPanel({ order }: { order: PurchaseOrder }) {
  const queryClient = useQueryClient()
  const checkId = useId()
  const [checked, setChecked] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const receive = useMutation({
    mutationFn: () => purchaseApi.receive(order.id),
    onSuccess: (updated) => {
      setConfirming(false)
      queryClient.setQueryData(purchaseKeys.detail(order.id), updated)
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.all })
      void queryClient.invalidateQueries({ queryKey: walletKeys.me })
    },
    onError: () => setConfirming(false),
  })

  return (
    <section aria-labelledby="receive-title" className="flex flex-col gap-4">
      <h2 id="receive-title" className="flex items-center gap-2 text-base font-bold text-tf-ink">
        <PackageCheck className="size-5 text-tf-primary" aria-hidden /> Bạn đã nhận được hàng?
      </h2>
      <p className="text-sm text-tf-ink-muted">
        Mở hàng và đối chiếu với ảnh, mô tả của tin đăng. Khi bạn xác nhận, ToyFlow chuyển tiền cho người bán và đơn hoàn
        tất. Nếu món đồ có vấn đề, <strong className="text-tf-ink">đừng xác nhận</strong> và liên hệ ToyFlow.
      </p>

      <label htmlFor={checkId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-tf-surface p-3">
        <input
          id={checkId}
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-tf-primary)]"
        />
        <span className="text-sm text-tf-ink">Tôi đã nhận và kiểm tra món đồ, đúng như mô tả.</span>
      </label>

      {receive.isError && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {getErrorMessage(receive.error, 'Không xác nhận được. Vui lòng thử lại.')}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          receive.reset()
          setConfirming(true)
        }}
        disabled={!checked || receive.isPending}
        className="inline-flex h-11 items-center justify-center self-start rounded-full bg-tf-primary px-6 text-sm font-bold text-white hover:bg-tf-primary-container disabled:cursor-not-allowed disabled:opacity-50"
      >
        Đã nhận &amp; hài lòng
      </button>

      {confirming && (
        <WalletDialog
          title="Xác nhận đã nhận hàng?"
          subtitle={`Chuyển ${formatVnd(order.pricing.itemPrice)} (giá món) cho người bán`}
          busy={receive.isPending}
          onClose={() => setConfirming(false)}
        >
          <div className="mt-4 flex flex-col gap-4 text-sm">
            <p className="text-tf-ink-muted">
              Sau bước này đơn <strong className="text-tf-ink">{order.code}</strong> hoàn tất và không thể khiếu nại về
              tình trạng món đồ nữa.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={receive.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-tf-surface px-5 font-semibold text-tf-ink hover:border-tf-primary disabled:opacity-60"
              >
                Chưa, để kiểm tra lại
              </button>
              <button
                type="button"
                onClick={() => receive.mutate()}
                disabled={receive.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-tf-primary px-5 font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
              >
                {receive.isPending ? 'Đang xác nhận…' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </WalletDialog>
      )}
    </section>
  )
}
