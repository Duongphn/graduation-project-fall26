import { z } from 'zod'

import { donationReceiverTypes, donationStatuses } from '../../constants/domain'
import { reasonSchema } from '../../schemas/common'
import { enumParam, objectIdParam, searchParam } from '../../schemas/list-params'
import { handoverMethods } from './constants'
import { ORGANIZATION_NOTE_MAX } from './donation-post-schema'
import type { HandoverInput } from './types'

// Admin confirmation that the receiver got the toy: a required reason, optional photos and note.
export const confirmReceivedSchema = z.object({
  reason: reasonSchema,
  photos: z
    .array(z.object({ publicId: z.string(), url: z.string(), format: z.string() }))
    .max(10, 'Tối đa 10 ảnh.'),
  note: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type ConfirmReceivedValues = z.infer<typeof confirmReceivedSchema>

// GB-59: the Admin records an organization's receipt: who confirmed, the channel, the received
// date (not before the sent date, not in the future: checked by the date picker and the API)
// and 1–10 receipt photos (MSG53).
export const organizationReceiptSchema = z.object({
  confirmedBy: z.string().trim().min(2, 'Nhập tên người xác nhận (2–100 ký tự).').max(100),
  channel: z.enum(['phone', 'email', 'in_person'], { error: 'Chọn kênh xác nhận.' }),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày nhận.'),
  photos: z
    .array(z.object({ publicId: z.string(), url: z.string(), format: z.string() }))
    .min(1, 'Vui lòng tải lên ít nhất một ảnh nhận hàng.')
    .max(10, 'Tối đa 10 ảnh.'),
  note: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type OrganizationReceiptInput = z.input<typeof organizationReceiptSchema>
export type OrganizationReceiptValues = z.output<typeof organizationReceiptSchema>

// Filters of the Admin list read from the URL (useListParams).
// UC35 step 1: status, organization, province of its receiving point and overdue confirmation.
export const donationFiltersSchema = z.object({
  status: enumParam(donationStatuses),
  receiverType: enumParam(donationReceiverTypes),
  organizationId: objectIdParam,
  province: searchParam,
  overdue: enumParam(['true']),
  q: searchParam,
})

// Donor marks a request as shipped (GB-58): the handover method, and for a carrier the carrier
// name and the tracking code as optional free text, 1–10 own HANDOVER_PHOTO uploads (required by
// the backend) and an optional note.
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
    if (values.method !== 'CARRIER' || !values.trackingCode) return
    if (!TRACKING_CODE_PATTERN.test(values.trackingCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['trackingCode'],
        message: 'Mã vận đơn gồm 6–30 ký tự chữ, số hoặc dấu gạch ngang.',
      })
    }
  })
export type ShipDonationValues = z.infer<typeof shipDonationSchema>

/** API value of each handover method (POST /donation-requests/:id/handover, POST /donation-posts, GB-58). */
export const handoverMethodValues = { CARRIER: 'carrier', SELF: 'drop_off' } as const

/** Body of POST /donation-requests/:id/handover: the carrier fields only for a carrier. */
export const toHandoverInput = ({ method, carrier, trackingCode, photos, note }: ShipDonationValues): HandoverInput => ({
  handoverMethod: handoverMethodValues[method],
  ...(method === 'CARRIER' && carrier ? { carrierName: carrier } : {}),
  ...(method === 'CARRIER' && trackingCode ? { trackingCode: trackingCode.toUpperCase() } : {}),
  photos: photos.map(({ publicId, format }) => ({ publicId, format })),
  ...(note ? { note } : {}),
})

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

// UC33 (GB-56): the Donor sends an Active donation post to an organization
// (POST /donation-requests/to-organization). MSG52: the handover method is required.
export const sendToOrganizationSchema = z.object({
  organizationId: z.string().min(1, 'Chọn tổ chức tiếp nhận.'),
  handoverMethod: z.enum(handoverMethods, { error: 'Vui lòng chọn mang đến hoặc gửi qua vận chuyển.' }),
  note: z
    .string()
    .trim()
    .max(ORGANIZATION_NOTE_MAX, `Ghi chú cho tổ chức tối đa ${ORGANIZATION_NOTE_MAX} ký tự.`),
})
export type SendToOrganizationValues = z.infer<typeof sendToOrganizationSchema>

// Admin creates a request for an organization (POST /admin/donation-requests).
export const createOrganizationRequestSchema = z.object({
  toyId: z.string().min(1, 'Chọn đồ chơi quyên góp.'),
  organizationId: z.string().min(1, 'Chọn tổ chức tiếp nhận.'),
  message: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type CreateOrganizationRequestValues = z.infer<typeof createOrganizationRequestSchema>
