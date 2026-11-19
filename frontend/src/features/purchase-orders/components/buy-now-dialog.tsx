import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, ShieldCheck, Truck, UserCheck, Wallet, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { profileQuery } from '../../profile/profile-queries'
import { formatVnd } from '../../toy-listings/format-vnd'
import { myWalletQuery } from '../../wallet/wallet-queries'
import { buyNow, quotePurchasePricing, type PurchaseOrderRecord } from '../purchase-order-api'

interface BuyNowDialogProps {
  toy: {
    id: string
    title: string
    priceOrRate: number
    condition?: string
    owner?: { id: string; displayName?: string }
  }
  open: boolean
  onClose: () => void
}

export function BuyNowDialog({ toy, open, onClose }: BuyNowDialogProps) {
  const queryClient = useQueryClient()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const profile = useQuery(profileQuery)
  const wallet = useQuery(myWalletQuery)

  const [deliveryMethod, setDeliveryMethod] = useState<'DELIVERY' | 'LOCAL_PICKUP'>('DELIVERY')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [ward, setWard] = useState('')
  const [street, setStreet] = useState('')
  const [notes, setNotes] = useState('')
  const [createdOrder, setCreatedOrder] = useState<PurchaseOrderRecord | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Prefill thông tin người nhận từ Profile khi mở dialog
  useEffect(() => {
    if (profile.data && !recipientName) {
      setRecipientName(profile.data.fullName || '')
      setRecipientPhone(profile.data.phone || '')
      if (profile.data.address) {
        setProvince(profile.data.address.province || '')
        setDistrict(profile.data.address.district || '')
        setWard(profile.data.address.ward || '')
        setStreet(profile.data.address.street || '')
      }
    }
  }, [profile.data, recipientName])

  // Lấy báo giá tính tiền
  const quote = useQuery({
    queryKey: ['purchase-quote', toy.id, deliveryMethod, province],
    queryFn: () => quotePurchasePricing({ toyId: toy.id, deliveryMethod, province: province || undefined }),
    enabled: open && !createdOrder,
  })

  const itemPrice = toy.priceOrRate
  const shippingFee = deliveryMethod === 'LOCAL_PICKUP' ? 0 : (quote.data?.shippingFee ?? 30_000)
  const totalPayable = itemPrice + shippingFee
  const availableBalance = wallet.data?.availableBalance ?? 0
  const isBalanceSufficient = availableBalance >= totalPayable
  const missingAmount = Math.max(0, totalPayable - availableBalance)

  const buyMutation = useMutation({
    mutationFn: buyNow,
    onSuccess: (order) => {
      setCreatedOrder(order)
      setErrorMsg(null)
      // Cập nhật lại cache của ví và chi tiết món đồ chơi
      void queryClient.invalidateQueries({ queryKey: ['wallet'] })
      void queryClient.invalidateQueries({ queryKey: ['toy-detail', toy.id] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi thực hiện thanh toán.'
      setErrorMsg(msg)
    },
  })

  if (!open) return null

  const handleConfirm = () => {
    setErrorMsg(null)
    if (deliveryMethod === 'DELIVERY') {
      if (!recipientName.trim()) {
        setErrorMsg('Vui lòng nhập họ tên người nhận hàng.')
        return
      }
      if (!recipientPhone.trim()) {
        setErrorMsg('Vui lòng nhập số điện thoại người nhận.')
        return
      }
      if (!province.trim()) {
        setErrorMsg('Vui lòng nhập Tỉnh/Thành phố nhận hàng.')
        return
      }
      if (!ward.trim()) {
        setErrorMsg('Vui lòng nhập Phường/Xã nhận hàng.')
        return
      }
      if (!street.trim()) {
        setErrorMsg('Vui lòng nhập số nhà, tên đường nhận hàng.')
        return
      }
    }

    buyMutation.mutate({
      toyId: toy.id,
      deliveryMethod,
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      province: province.trim(),
      district: district.trim(),
      ward: ward.trim(),
      street: street.trim(),
      notes: notes.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Đóng"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => !buyMutation.isPending && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4 border-b pb-3">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-gray-900">
              {createdOrder ? 'Mua hàng thành công!' : 'Mua ngay đồ chơi'}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {toy.title} • {formatVnd(toy.priceOrRate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={buyMutation.isPending}
            aria-label="Đóng"
            className="grid size-8 place-items-center rounded-full text-gray-400 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        {createdOrder ? (
          <div className="py-6 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-10" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-gray-900">Thanh toán Escrow thành công!</h3>
            <p className="mt-1 text-sm text-gray-600">
              Mã đơn hàng: <strong className="font-mono text-emerald-700">{createdOrder.code}</strong>
            </p>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-left text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-semibold text-emerald-800">
                <ShieldCheck className="size-4" />
                Đảm bảo an toàn qua Escrow ToyFlow:
              </div>
              <p className="mt-1">
                Số tiền <strong>{formatVnd(createdOrder.pricing.totalPayable)}</strong> đã được trừ khỏi ví và đang tạm giữ an toàn trong Escrow. Người bán sẽ nhận được thông báo để chuẩn bị và giao hàng cho bạn.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                to="/wallet"
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-200"
              >
                Kiểm tra ví của bạn
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="size-5 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Chọn cách nhận hàng */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                1. Cách nhận hàng
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryMethod('DELIVERY')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    deliveryMethod === 'DELIVERY'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-600'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Truck className="size-5 mb-1" />
                  <span className="text-sm font-semibold">Giao tận nơi</span>
                  <span className="text-xs text-gray-500">+30.000 đ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMethod('LOCAL_PICKUP')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    deliveryMethod === 'LOCAL_PICKUP'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-600'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <UserCheck className="size-5 mb-1" />
                  <span className="text-sm font-semibold">Gặp tự lấy</span>
                  <span className="text-xs text-emerald-600 font-medium">Miễn phí</span>
                </button>
              </div>
            </div>

            {/* Form địa chỉ nhận hàng */}
            {deliveryMethod === 'DELIVERY' ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  2. Địa chỉ nhận hàng
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-600">Họ tên người nhận *</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Số điện thoại *</label>
                    <input
                      type="tel"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="0912345678"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-gray-600">Tỉnh / Thành phố *</label>
                    <input
                      type="text"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="Hà Nội"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Quận / Huyện</label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      placeholder="Cầu Giấy"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Phường / Xã *</label>
                    <input
                      type="text"
                      value={ward}
                      onChange={(e) => setWard(e.target.value)}
                      placeholder="Dịch Vọng Hậu"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Địa chỉ cụ thể (Số nhà, đường) *</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Số 123 đường ABC"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600">Ghi chú giao hàng</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Giao giờ hành chính, gọi trước khi đến..."
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 text-xs text-gray-600">
                <span className="font-semibold text-gray-800">Điểm hẹn lấy đồ:</span> Bạn sẽ trực tiếp gặp chủ đồ chơi ({toy.owner?.displayName || 'Chủ món đồ'}) để nhận đồ. Sau khi thanh toán vào Escrow, ToyFlow sẽ cung cấp số điện thoại và tin nhắn để hai bên hẹn giờ lấy đồ.
              </div>
            )}

            {/* Chi tiết thanh toán */}
            <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                3. Chi tiết thanh toán
              </span>
              <div className="flex justify-between text-gray-600">
                <span>Giá đồ chơi:</span>
                <span className="font-medium text-gray-900">{formatVnd(itemPrice)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Phí vận chuyển:</span>
                <span className="font-medium text-gray-900">
                  {shippingFee === 0 ? 'Miễn phí (Tự lấy)' : formatVnd(shippingFee)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between text-base font-bold text-gray-900">
                <span>Tổng cần thanh toán:</span>
                <span className="text-emerald-700">{formatVnd(totalPayable)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed pt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Wallet className="size-3.5 text-gray-400" />
                  Số dư ví ToyFlow khả dụng:
                </span>
                <strong className={isBalanceSufficient ? 'text-gray-900' : 'text-red-600'}>
                  {formatVnd(availableBalance)}
                </strong>
              </div>
            </div>

            {/* Cảnh báo thiếu tiền ví & Nút mua */}
            {!isBalanceSufficient ? (
              <div className="space-y-2">
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    Số dư ví hiện tại không đủ để thanh toán. Bạn còn thiếu{' '}
                    <strong>{formatVnd(missingAmount)}</strong>.
                  </div>
                </div>
                <Link
                  to={`/wallet?topup=${missingAmount}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-bold text-white shadow hover:bg-amber-700"
                >
                  Nạp thêm {formatVnd(missingAmount)} vào ví
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={buyMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {buyMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Đang khóa tin & thanh toán Escrow...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-5" />
                    Xác nhận thanh toán {formatVnd(totalPayable)} vào Escrow
                  </>
                )}
              </button>
            )}

            <p className="text-center text-[11px] text-gray-400">
              Tiền của bạn sẽ được giữ an toàn trong Escrow sàn cho đến khi bạn xác nhận đã nhận hàng.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
