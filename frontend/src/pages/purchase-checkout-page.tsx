import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Home, MapPin, PackageCheck, Truck, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import type { DeliveryAddress as SavedAddress } from '../features/profile/profile-api'
import { addressesQuery, profileQuery } from '../features/profile/profile-queries'
import { CheckoutSummary } from '../features/purchases/components/checkout-summary'
import { purchaseApi, type DeliveryMethod } from '../features/purchases/purchase-api'
import { DELIVERY_METHOD_LABELS, PROVINCES } from '../features/purchases/purchase-display'
import {
  toBuyNowInput,
  validateCheckout,
  type CheckoutFieldErrors,
  type CheckoutFormValues,
} from '../features/purchases/purchase-forms'
import { purchaseKeys, purchaseQuoteQuery } from '../features/purchases/purchase-queries'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { WalletDialog } from '../features/wallet/components/wallet-dialog'
import { suggestedTopupAmount, walletTopupLink } from '../features/wallet/topup-session'
import { myWalletQuery, walletKeys } from '../features/wallet/wallet-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS, purchaseOrderPath, toyDetailPath } from '../routes/paths'
import { ApiError, getErrorMessage } from '../services/api-error'
import { getStoredUser } from '../services/token-storage'

const METHODS: Array<{ value: DeliveryMethod; hint: string; icon: LucideIcon }> = [
  { value: 'DELIVERY', hint: 'Người bán gửi qua đơn vị vận chuyển, phí 30.000 ₫', icon: Truck },
  { value: 'LOCAL_PICKUP', hint: 'Hẹn người bán để nhận trực tiếp, miễn phí giao', icon: MapPin },
]

/** Lỗi "món không mua được nữa" của quote / buy-now */
const UNAVAILABLE_CODES = new Set(['TOY_NOT_FOUND', 'TOY_OUT_OF_STOCK', 'TOY_ALREADY_SOLD', 'INVALID_LISTING_TYPE'])

const inputClass = (invalid: boolean) =>
  `mt-1 h-11 w-full rounded-lg border bg-white px-3 text-base text-tf-ink outline-none focus:ring-2 focus:ring-tf-primary/30 ${
    invalid ? 'border-red-500' : 'border-tf-outline'
  }`

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-tf-ink">
        {label}
      </label>
      {children}
      <p id={`${id}-error`} className="mt-1 text-xs text-red-600 empty:hidden">
        {error}
      </p>
    </div>
  )
}

/**
 * UC12 Buy now: chọn cách nhận + địa chỉ, xem giá + phí giao (POST /purchase-orders/quote), thanh toán
 * bằng ví vào ký quỹ (POST /purchase-orders/buy-now). Server khoá tin trong cùng giao dịch nên hai người
 * bấm cùng lúc thì chỉ một người mua được; người kia nhận lỗi TOY_ALREADY_SOLD.
 */
export function PurchaseCheckoutPage() {
  const { toyId = '' } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ids = { name: useId(), phone: useId(), province: useId(), ward: useId(), street: useId(), notes: useId() }
  const provinceListId = useId()

  const profile = useQuery(profileQuery)
  // Sổ địa chỉ (Hồ sơ): mặc định chọn địa chỉ mặc định, người mua bấm để đổi sang địa chỉ khác
  const addresses = useQuery(addressesQuery)
  const book = addresses.data ?? []
  const [addressId, setAddressId] = useState<string>()
  const chosen = book.find((address) => address.id === addressId) ?? book.find((address) => address.isDefault) ?? book[0]
  // Ô người dùng đã sửa; ô chưa sửa lấy từ địa chỉ đang chọn, không có thì từ hồ sơ (tên, số điện thoại)
  const [edits, setEdits] = useState<Partial<CheckoutFormValues>>({})
  const saved = profile.data
  const values: CheckoutFormValues = {
    deliveryMethod: 'DELIVERY',
    recipientName: chosen?.recipientName ?? saved?.fullName ?? '',
    recipientPhone: chosen?.phone ?? saved?.phone ?? '',
    province: chosen?.province ?? '',
    ward: chosen?.ward ?? '',
    street: chosen?.street ?? '',
    notes: '',
    ...edits,
  }
  const [errors, setErrors] = useState<CheckoutFieldErrors>({})
  const [confirming, setConfirming] = useState(false)

  const quote = useQuery(purchaseQuoteQuery(toyId, values.deliveryMethod))
  const wallet = useQuery(myWalletQuery)
  const balance = wallet.data ? (wallet.data.availableBalance ?? wallet.data.balance) : undefined

  const buy = useMutation({
    mutationFn: () => purchaseApi.buyNow(toBuyNowInput(toyId, values)),
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: walletKeys.me }),
        queryClient.invalidateQueries({ queryKey: purchaseKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['toy-detail', toyId] }),
      ])
      navigate(purchaseOrderPath(order.id), { replace: true })
    },
    onError: (error) => {
      setConfirming(false)
      // Lỗi từng ô do server trả (VALIDATION_ERROR) hiện ngay dưới ô
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setErrors(Object.fromEntries(error.fieldErrors.map((detail) => [detail.field, detail.message])))
      }
    },
  })

  useEffect(() => {
    document.title = 'Mua ngay | ToyFlow'
  }, [])

  const set = <K extends keyof CheckoutFormValues>(key: K, value: CheckoutFormValues[K]) => {
    setEdits((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  /** Chọn một địa chỉ đã lưu: điền lại các ô địa chỉ (bỏ phần đã sửa tay), giữ cách nhận và ghi chú */
  const pickAddress = (address: SavedAddress) => {
    setAddressId(address.id)
    setEdits(({ deliveryMethod, notes }) => ({
      ...(deliveryMethod !== undefined && { deliveryMethod }),
      ...(notes !== undefined && { notes }),
    }))
    setErrors(({ notes }) => (notes ? { notes } : {}))
  }

  const data = quote.data
  const isOwnToy = data !== undefined && data.sellerId === getStoredUser()?.id
  const shortfall = data && balance !== undefined ? Math.max(0, data.totalPayable - balance) : 0
  const quoteCode = quote.error instanceof ApiError ? quote.error.code : undefined
  const buyCode = buy.error instanceof ApiError ? buy.error.code : undefined
  const unavailable = UNAVAILABLE_CODES.has(quoteCode ?? '') || UNAVAILABLE_CODES.has(buyCode ?? '')
  const canPay = data !== undefined && balance !== undefined && shortfall === 0 && !isOwnToy && !unavailable

  const review = () => {
    const found = validateCheckout(values)
    setErrors(found)
    if (Object.keys(found).length === 0 && canPay) {
      buy.reset()
      setConfirming(true)
    }
  }

  const delivery = values.deliveryMethod === 'DELIVERY'

  return (
    <AccountLayout activeItem="browse">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-tf-ink-muted">
        <Link to={PATHS.home} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-tf-primary">
          <Home className="size-3.5" aria-hidden /> Trang chủ
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Link to={toyDetailPath(toyId)} className="min-w-0 truncate hover:text-tf-primary">
          {data?.title ?? 'Đồ chơi'}
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <span aria-current="page" className="shrink-0 font-medium text-tf-ink">
          Mua ngay
        </span>
      </nav>

      <h1 className="mt-4 text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">Mua ngay</h1>

      {unavailable ? (
        <div role="alert" className="mt-6 rounded-2xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
          <p className="font-semibold text-tf-ink">Món đồ chơi này không còn mua được.</p>
          <p className="mt-1 text-sm text-tf-ink-muted">
            {getErrorMessage(buy.error ?? quote.error, 'Có thể đã có người mua trước hoặc người bán đã ẩn tin.')}
          </p>
          <Link
            to={PATHS.toys}
            className="mt-4 inline-flex h-10 items-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container"
          >
            Xem các món khác
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              review()
            }}
            className="flex flex-col gap-6 rounded-2xl border border-tf-surface bg-white p-5 sm:p-6"
          >
            <fieldset>
              <legend className="text-base font-bold text-tf-ink">1. Cách nhận hàng</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {METHODS.map((method) => (
                  <label
                    key={method.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tf-primary/30 ${
                      values.deliveryMethod === method.value
                        ? 'border-tf-primary bg-tf-primary-fixed'
                        : 'border-tf-surface hover:border-tf-primary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery-method"
                      value={method.value}
                      checked={values.deliveryMethod === method.value}
                      onChange={() => set('deliveryMethod', method.value)}
                      className="sr-only"
                    />
                    <method.icon className="mt-0.5 size-5 shrink-0 text-tf-primary" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold text-tf-ink">{DELIVERY_METHOD_LABELS[method.value]}</span>
                      <span className="block text-xs text-tf-ink-muted">{method.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {delivery ? (
              <fieldset>
                <legend className="text-base font-bold text-tf-ink">2. Địa chỉ nhận hàng</legend>
                <div className="mt-3 flex flex-col gap-4">
                  {book.length > 0 ? (
                    <div role="radiogroup" aria-label="Địa chỉ đã lưu" className="grid gap-2 sm:grid-cols-2">
                      {book.map((address) => (
                        <label
                          key={address.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tf-primary/30 ${
                            chosen?.id === address.id ? 'border-tf-primary bg-tf-primary-fixed' : 'border-tf-surface hover:border-tf-primary'
                          }`}
                        >
                          <input
                            type="radio"
                            name="saved-address"
                            value={address.id}
                            checked={chosen?.id === address.id}
                            onChange={() => pickAddress(address)}
                            className="mt-1 accent-[var(--color-tf-primary)]"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-tf-ink">
                              {address.recipientName} · {address.phone}
                              {address.isDefault && (
                                <span className="ml-2 rounded-full bg-tf-surface px-2 py-0.5 text-[11px] font-semibold text-tf-ink-muted">
                                  Mặc định
                                </span>
                              )}
                            </span>
                            <span className="block text-tf-ink-muted">
                              {[address.street, address.ward, address.province].filter(Boolean).join(', ')}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    addresses.isSuccess && (
                      <p className="text-sm text-tf-ink-muted">
                        Bạn chưa lưu địa chỉ nào.{' '}
                        <Link to={PATHS.profile} className="font-semibold text-tf-primary hover:underline">
                          Thêm vào sổ địa chỉ
                        </Link>{' '}
                        để lần sau chọn nhanh.
                      </p>
                    )
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={ids.name} label="Họ tên người nhận" error={errors.recipientName}>
                      <input
                        id={ids.name}
                        autoComplete="name"
                        value={values.recipientName}
                        onChange={(event) => set('recipientName', event.target.value)}
                        aria-invalid={Boolean(errors.recipientName)}
                        aria-describedby={`${ids.name}-error`}
                        className={inputClass(Boolean(errors.recipientName))}
                      />
                    </Field>
                    <Field id={ids.phone} label="Số điện thoại" error={errors.recipientPhone}>
                      <input
                        id={ids.phone}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={values.recipientPhone}
                        onChange={(event) => set('recipientPhone', event.target.value)}
                        aria-invalid={Boolean(errors.recipientPhone)}
                        aria-describedby={`${ids.phone}-error`}
                        className={inputClass(Boolean(errors.recipientPhone))}
                      />
                    </Field>
                    <Field id={ids.province} label="Tỉnh/Thành phố" error={errors.province}>
                      <input
                        id={ids.province}
                        list={provinceListId}
                        autoComplete="address-level1"
                        value={values.province}
                        onChange={(event) => set('province', event.target.value)}
                        aria-invalid={Boolean(errors.province)}
                        aria-describedby={`${ids.province}-error`}
                        className={inputClass(Boolean(errors.province))}
                      />
                      <datalist id={provinceListId}>
                        {PROVINCES.map((province) => (
                          <option key={province} value={province} />
                        ))}
                      </datalist>
                    </Field>
                    <Field id={ids.ward} label="Phường/Xã" error={errors.ward}>
                      <input
                        id={ids.ward}
                        autoComplete="address-level3"
                        value={values.ward}
                        onChange={(event) => set('ward', event.target.value)}
                        aria-invalid={Boolean(errors.ward)}
                        aria-describedby={`${ids.ward}-error`}
                        className={inputClass(Boolean(errors.ward))}
                      />
                    </Field>
                  </div>
                  <Field id={ids.street} label="Số nhà, tên đường" error={errors.street}>
                    <input
                      id={ids.street}
                      autoComplete="street-address"
                      value={values.street}
                      onChange={(event) => set('street', event.target.value)}
                      aria-invalid={Boolean(errors.street)}
                      aria-describedby={`${ids.street}-error`}
                      className={inputClass(Boolean(errors.street))}
                    />
                  </Field>
                </div>
              </fieldset>
            ) : (
              <p className="flex items-start gap-2 rounded-xl bg-tf-surface/60 px-4 py-3 text-sm text-tf-ink-muted">
                <PackageCheck className="mt-0.5 size-4 shrink-0 text-tf-primary" aria-hidden />
                Sau khi thanh toán, bạn và người bán hẹn thời gian, địa điểm nhận đồ. Kiểm tra kỹ món đồ trước khi bấm
                "Đã nhận &amp; hài lòng".
              </p>
            )}

            <Field id={ids.notes} label="Ghi chú cho người bán (không bắt buộc)" error={errors.notes}>
              <textarea
                id={ids.notes}
                rows={3}
                maxLength={500}
                value={values.notes}
                onChange={(event) => set('notes', event.target.value)}
                aria-describedby={`${ids.notes}-error`}
                placeholder="Ví dụ: giao giờ hành chính, gọi trước khi giao"
                className={`${inputClass(Boolean(errors.notes))} h-auto py-2`}
              />
            </Field>

            {/* Nút gửi form cho bàn phím; nút chính nằm ở cột tóm tắt */}
            <button type="submit" className="sr-only">
              Xem lại và thanh toán
            </button>
          </form>

          <CheckoutSummary
            quote={data}
            balance={balance}
            topupHref={walletTopupLink(PATHS.wallet, suggestedTopupAmount(shortfall), pathname)}
          >
            {isOwnToy && (
              <p className="rounded-xl bg-tf-surface/60 px-3 py-2 text-sm text-tf-ink-muted">
                Đây là tin của bạn nên không thể tự mua.
              </p>
            )}
            {quote.isError && !unavailable && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {getErrorMessage(quote.error, 'Chưa tính được giá. Vui lòng thử lại.')}
              </p>
            )}
            {buy.isError && !unavailable && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {getErrorMessage(buy.error, 'Không thanh toán được. Vui lòng thử lại.')}
              </p>
            )}
            <button
              type="button"
              onClick={review}
              disabled={!canPay || buy.isPending}
              className="inline-flex h-11 items-center justify-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container disabled:cursor-not-allowed disabled:opacity-50"
            >
              {data ? `Thanh toán ${formatVnd(data.totalPayable)} bằng ví` : 'Thanh toán bằng ví'}
            </button>
          </CheckoutSummary>
        </div>
      )}

      {confirming && data && (
        <WalletDialog
          title="Xác nhận thanh toán"
          subtitle={`Trừ ${formatVnd(data.totalPayable)} từ ví ToyFlow`}
          busy={buy.isPending}
          onClose={() => setConfirming(false)}
        >
          <div className="mt-4 flex flex-col gap-4 text-sm">
            <dl className="divide-y divide-tf-surface rounded-xl border border-tf-surface">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Món</dt>
                <dd className="text-right font-semibold text-tf-ink">{data.title}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Cách nhận</dt>
                <dd className="text-right font-semibold text-tf-ink">{DELIVERY_METHOD_LABELS[values.deliveryMethod]}</dd>
              </div>
              {delivery && (
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-tf-ink-muted">Giao tới</dt>
                  <dd className="text-right font-semibold text-tf-ink">
                    {values.recipientName} · {values.street}, {values.ward}, {values.province}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-tf-ink-muted">Tổng thanh toán</dt>
                <dd className="font-bold text-tf-primary tabular-nums">{formatVnd(data.totalPayable)}</dd>
              </div>
            </dl>
            <p className="text-xs text-tf-ink-muted">
              Tin đăng được giữ cho bạn ngay khi thanh toán. Tiền nằm trong ký quỹ tới khi bạn xác nhận đã nhận hàng.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={buy.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-tf-surface px-5 font-semibold text-tf-ink hover:border-tf-primary disabled:opacity-60"
              >
                Xem lại
              </button>
              <button
                type="button"
                onClick={() => buy.mutate()}
                disabled={buy.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-tf-primary px-5 font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
              >
                {buy.isPending ? 'Đang thanh toán…' : 'Thanh toán'}
              </button>
            </div>
          </div>
        </WalletDialog>
      )}
    </AccountLayout>
  )
}
