import { z } from 'zod'

import type { BuyNowInput, DeliveryMethod } from './purchase-api'
import { HAND_DELIVERY } from './purchase-display'

/** Giống createBuyNowSchema của backend: giao tận nơi thì bắt buộc người nhận + địa chỉ */
export const checkoutFormSchema = z
  .object({
    deliveryMethod: z.enum(['DELIVERY', 'LOCAL_PICKUP']),
    recipientName: z.string().trim(),
    recipientPhone: z.string().trim(),
    province: z.string().trim(),
    ward: z.string().trim(),
    street: z.string().trim(),
    notes: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.'),
  })
  .superRefine((values, ctx) => {
    if (values.deliveryMethod !== 'DELIVERY') return
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (values.recipientName.length < 2) issue('recipientName', 'Vui lòng nhập họ tên người nhận.')
    if (!/^(?:\+84|0)\d{9,10}$/.test(values.recipientPhone.replace(/[\s.-]/g, '')))
      issue('recipientPhone', 'Số điện thoại người nhận không hợp lệ.')
    if (!values.province) issue('province', 'Vui lòng nhập Tỉnh/Thành phố.')
    if (!values.ward) issue('ward', 'Vui lòng nhập Phường/Xã.')
    if (!values.street) issue('street', 'Vui lòng nhập số nhà, tên đường.')
  })

export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>
export type CheckoutFieldErrors = Partial<Record<keyof CheckoutFormValues, string>>

const firstErrors = <T extends string>(issues: z.core.$ZodIssue[]) => {
  const errors: Partial<Record<T, string>> = {}
  for (const issue of issues) errors[issue.path[0] as T] ??= issue.message
  return errors
}

export function validateCheckout(values: CheckoutFormValues): CheckoutFieldErrors {
  const result = checkoutFormSchema.safeParse(values)
  return result.success ? {} : firstErrors<keyof CheckoutFormValues>(result.error.issues)
}

/** Body của POST /purchase-orders/buy-now: tự đến lấy thì không gửi địa chỉ */
export function toBuyNowInput(toyId: string, values: CheckoutFormValues): BuyNowInput {
  const notes = values.notes.trim() || undefined
  if (values.deliveryMethod === 'LOCAL_PICKUP') return { toyId, deliveryMethod: 'LOCAL_PICKUP', notes }
  return {
    toyId,
    deliveryMethod: 'DELIVERY',
    recipientName: values.recipientName.trim(),
    recipientPhone: values.recipientPhone.replace(/[\s.-]/g, ''),
    province: values.province.trim(),
    ward: values.ward.trim(),
    street: values.street.trim(),
    notes,
  }
}

export interface ShipFormValues {
  carrierName: string
  trackingCode: string
  photoCount: number
  note: string
}

export type ShipFieldErrors = Partial<Record<'carrierName' | 'trackingCode' | 'photos' | 'note', string>>

/**
 * Người bán xác nhận gửi hàng (UC13): ít nhất 1 ảnh đóng gói; mã vận đơn bắt buộc trừ khi giao trực tiếp
 * hoặc người mua tự đến lấy. Backend chỉ bắt buộc đơn vị vận chuyển — frontend chặt hơn để có bằng chứng.
 */
export function validateShip(values: ShipFormValues, deliveryMethod: DeliveryMethod): ShipFieldErrors {
  const errors: ShipFieldErrors = {}
  if (!values.carrierName.trim()) errors.carrierName = 'Vui lòng chọn đơn vị vận chuyển.'
  const needsTracking = deliveryMethod === 'DELIVERY' && values.carrierName !== HAND_DELIVERY
  if (needsTracking && !values.trackingCode.trim()) errors.trackingCode = 'Vui lòng nhập mã vận đơn.'
  if (values.photoCount < 1) errors.photos = 'Thêm ít nhất 1 ảnh đóng gói hoặc bàn giao.'
  if (values.note.trim().length > 500) errors.note = 'Ghi chú tối đa 500 ký tự.'
  return errors
}
