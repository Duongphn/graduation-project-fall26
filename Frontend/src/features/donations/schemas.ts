import { z } from 'zod'

import { donationReceiverTypes, donationStatuses } from '../../constants/domain'
import { reasonSchema } from '../../schemas/common'
import { enumParam, searchParam } from '../../schemas/list-params'
import { handoverMethodLabels, handoverMethods } from './constants'

// Admin confirmation that the receiver got the toy: a required reason, optional photos and note.
export const confirmReceivedSchema = z.object({
  reason: reasonSchema,
  photos: z
    .array(z.object({ publicId: z.string(), url: z.string(), format: z.string() }))
    .max(10, 'Tối đa 10 ảnh.'),
  note: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type ConfirmReceivedValues = z.infer<typeof confirmReceivedSchema>

// Filters of the Admin list read from the URL (useListParams).
export const donationFiltersSchema = z.object({
  status: enumParam(donationStatuses),
  receiverType: enumParam(donationReceiverTypes),
  q: searchParam,
})

// Donor marks a request as shipped: a carrier and a tracking code when sent by a carrier,
// 1–10 own HANDOVER_PHOTO uploads (required by the backend) and an optional note.
export const TRACKING_CODE_PATTERN = /^[A-Za-z0-9-]{6,30}$/

export const shipDonationSchema = z
  .object({
    method: z.enum(handoverMethods),
    carrier: z.string(),
    trackingCode: z.string().trim(),
    photos: z
      .array(z.object({ publicId: z.string(), url: z.string(), format: z.string() }))
      .min(1, 'Cần ít nhất 1 ảnh kiện hàng hoặc biên nhận gửi hàng.')
      .max(10, 'Tối đa 10 ảnh.'),
    note: z.string().trim().max(600, 'Tối đa 600 ký tự.'),
  })
  .superRefine((values, ctx) => {
    if (values.method !== 'CARRIER') return
    if (!values.carrier) {
      ctx.addIssue({ code: 'custom', path: ['carrier'], message: 'Chọn đơn vị vận chuyển.' })
    }
    if (!TRACKING_CODE_PATTERN.test(values.trackingCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['trackingCode'],
        message: 'Mã vận đơn gồm 6–30 ký tự chữ, số hoặc dấu gạch ngang.',
      })
    }
  })
export type ShipDonationValues = z.infer<typeof shipDonationSchema>

/** Đơn vị vận chuyển và mã vận đơn được ghi ở đầu ghi chú bàn giao (backend chưa có trường riêng) */
export const composeHandoverNote = ({ method, carrier, trackingCode, note }: ShipDonationValues) =>
  [
    method === 'CARRIER'
      ? `Đơn vị vận chuyển: ${carrier}\nMã vận đơn: ${trackingCode.toUpperCase()}`
      : handoverMethodLabels.SELF,
    note,
  ]
    .filter(Boolean)
    .join('\n')

// Receiver asks for a donation toy (POST /donation-requests): an optional message to the Donor.
export const requestToySchema = z.object({
  message: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type RequestToyValues = z.infer<typeof requestToySchema>

// Receiver confirms receipt (POST /donation-requests/:id/confirm-received): 1–10 HANDOVER_PHOTO.
export const confirmReceiptSchema = z.object({
  photos: z
    .array(z.object({ publicId: z.string(), url: z.string(), format: z.string() }))
    .min(1, 'Cần ít nhất 1 ảnh đồ chơi lúc nhận.')
    .max(10, 'Tối đa 10 ảnh.'),
  note: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type ConfirmReceiptValues = z.infer<typeof confirmReceiptSchema>

// Admin creates a request for an organization (POST /admin/donation-requests).
export const createOrganizationRequestSchema = z.object({
  toyId: z.string().min(1, 'Chọn đồ chơi quyên góp.'),
  organizationId: z.string().min(1, 'Chọn tổ chức tiếp nhận.'),
  message: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type CreateOrganizationRequestValues = z.infer<typeof createOrganizationRequestSchema>
