import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  privateImageInputSchema,
  reasonSchema,
  searchQuerySchema,
} from './common.validation.js';
import { z } from './zod.js';
import { normalizeText } from '../utils/text.js';
import {
  DONOR_REQUEST_NOTE_MAX,
  handoverMethods,
  receiptChannels,
  storedDonationStatuses,
} from '../constants/donation-request-transitions.js';

const donationReceiverTypes = ['USER', 'ORGANIZATION'] as const;

// Request and response schemas of the donation flow (FE-02, BF-04).

/**
 * Handover photos are private uploads with the HANDOVER_PHOTO purpose: the uploads feature signs
 * the public_id "toyflow/handovers/<uploader id>/<random>". The service also checks that the
 * uploader segment is the caller (a photo of somebody else's upload is refused).
 */
export const HANDOVER_PHOTO_PATTERN = /^toyflow\/handovers\/([a-f0-9]{24})\/[A-Za-z0-9_-]{1,64}$/;

const handoverPhotoSchema = privateImageInputSchema.refine(
  (photo) => HANDOVER_PHOTO_PATTERN.test(photo.publicId),
  { message: 'Ảnh bàn giao phải được tải lên với mục đích HANDOVER_PHOTO.' },
);

const photosSchema = z.array(handoverPhotoSchema).min(1).max(10);
const noteSchema = z.string().trim().max(1000).optional();

// ---- Inputs ----------------------------------------------------------------------------------

export const createRequestBodySchema = z
  .object({
    toyId: objectIdSchema,
    message: z.string().trim().max(1000).optional(),
  })
  .strict()
  .openapi('CreateDonationRequest');
export type CreateRequestBody = z.infer<typeof createRequestBodySchema>;

/** MSG52 (R03 V.2): a handover needs a method. */
export const handoverMethodSchema = z
  .enum(handoverMethods, { error: 'Vui lòng chọn mang đến hoặc gửi qua vận chuyển.' })
  .openapi({ description: 'drop_off (at the receiving point) or carrier (GB-58).' });

/**
 * UC33 2.1, GB-56: the Donor sends their own Active donation post to an organization that is
 * accepting toys; the Admin decides it. The Donor picks the method (required, MSG52); it is
 * checked against the receiving point now and can still change at the handover.
 */
export const donorOrganizationRequestBodySchema = z
  .object({
    toyId: objectIdSchema,
    organizationId: objectIdSchema,
    message: z
      .string()
      .trim()
      .max(DONOR_REQUEST_NOTE_MAX, `Ghi chú tối đa ${DONOR_REQUEST_NOTE_MAX} ký tự.`)
      .optional()
      .openapi({ description: 'Note to the organization (R03 III.5.2.1 (8)).' }),
    handoverMethod: handoverMethodSchema,
  })
  .strict()
  .openapi('DonorOrganizationRequest');
export type DonorOrganizationRequestBody = z.infer<typeof donorOrganizationRequestBodySchema>;

export const adminCreateRequestBodySchema = createRequestBodySchema
  .extend({ organizationId: objectIdSchema })
  .strict()
  .openapi('AdminCreateDonationRequest');
export type AdminCreateRequestBody = z.infer<typeof adminCreateRequestBodySchema>;

export const rejectBodySchema = z.object({ reason: reasonSchema }).strict();
export type RejectBody = z.infer<typeof rejectBodySchema>;

/** A user may explain a cancellation; an Admin must (adminCancelBodySchema). */
export const cancelBodySchema = z.object({ note: noteSchema }).strict();
export type CancelBody = z.infer<typeof cancelBodySchema>;

/** An Admin cancels with a required reason (also a SHIPPING request that is stuck). */
export const adminCancelBodySchema = z
  .object({ reason: reasonSchema })
  .strict()
  .openapi('AdminCancelDonationRequest');
export type AdminCancelBody = z.infer<typeof adminCancelBodySchema>;

/**
 * GB-58: the method is required (MSG52) and must be one the organization's receiving point
 * accepts (422 HANDOVER_METHOD_NOT_ALLOWED). Carrier name and tracking code are optional free
 * text, for a carrier only; ToyFlow does not check them (LI-05).
 */
export const handoverBodySchema = z
  .object({
    handoverMethod: handoverMethodSchema,
    carrierName: z.string().trim().min(1).max(100).optional(),
    trackingCode: z.string().trim().min(1).max(50).optional(),
    photos: photosSchema,
    note: noteSchema,
  })
  .strict()
  .refine(
    (body) =>
      body.handoverMethod === 'carrier' ||
      (body.carrierName === undefined && body.trackingCode === undefined),
    {
      message: 'Chỉ nhập đơn vị vận chuyển và mã vận đơn khi gửi qua vận chuyển.',
      path: ['carrierName'],
    },
  )
  .openapi('DonationHandoverInput');
export type HandoverBody = z.infer<typeof handoverBodySchema>;

/**
 * The receiving user confirms receipt with at least one photo of the toy as received (BF-04
 * step 4, FE-02 "same photo steps as FE-07", GB-20). Recorded as a RECEIVER_RECEIVED handover.
 */
export const confirmReceivedBodySchema = z
  .object({ photos: photosSchema, note: noteSchema })
  .strict()
  .openapi('DonationReceiptInput');
export type ConfirmReceivedBody = z.infer<typeof confirmReceivedBodySchema>;

/**
 * An Admin confirms receipt for an organization (which has no account to upload from), or for
 * a USER receiver whose SHIPPING request is stuck; in that second case `reason` is required
 * (422 REASON_REQUIRED) and audited. Photos are optional for the Admin: when given they are
 * recorded as the RECEIVER_RECEIVED handover.
 */
export const adminConfirmReceivedBodySchema = z
  .object({
    photos: photosSchema.optional(),
    note: noteSchema,
    reason: reasonSchema.optional(),
    // GB-59, organization receivers only (required there, 422 RECEIPT_DETAILS_REQUIRED).
    confirmedBy: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .openapi({ description: 'The person at the organization who confirmed receipt.' }),
    channel: z.enum(receiptChannels).optional(),
    receivedAt: z.iso.date().optional().openapi({
      description:
        'Received date (YYYY-MM-DD, Vietnam time): not before the sent date, not in the future.',
      example: '2026-11-17',
    }),
  })
  .strict()
  .openapi('AdminDonationReceiptInput');
export type AdminConfirmReceivedBody = z.infer<typeof adminConfirmReceivedBodySchema>;

export const donationRequestSortFields = ['createdAt', 'updatedAt', 'status', 'code'] as const;

const statusFilter = z.enum(storedDonationStatuses).optional();

export const myRequestsQuerySchema = paginationQueryWithSort(donationRequestSortFields)
  .extend({ status: statusFilter })
  .strict();
export type MyRequestsQuery = z.infer<typeof myRequestsQuerySchema>;

const adminFilterShape = {
  receiverType: z.enum(donationReceiverTypes).optional(),
  organizationId: objectIdSchema.optional(),
  // UC35 step 1: the province of the organization's receiving point, as the Admin types it.
  province: z
    .string()
    .max(100)
    .transform((value) => normalizeText(value) || undefined)
    .refine((value) => value === undefined || value.length >= 2, {
      message: 'Tỉnh/Thành phố cần từ 2 đến 100 ký tự.',
    })
    .optional()
    .openapi({
      description:
        "Province of the organization's receiving point. Accents, case, extra spaces and a " +
        '"TP."/"Thành phố"/"Tỉnh" prefix are ignored.',
      example: 'Hồ Chí Minh',
    }),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true'))
    .openapi({
      description:
        'true: only shipping requests past DONATION_CONFIRM_DAYS (GB-57); false: the others.',
      example: 'true',
    }),
  q: searchQuerySchema.openapi({
    description: 'Request code (prefix) or toy title (accents ignored).',
  }),
};

export const adminFiltersSchema = z.object(adminFilterShape).strict();
export type AdminFilters = z.infer<typeof adminFiltersSchema>;

export const adminListQuerySchema = paginationQueryWithSort(donationRequestSortFields)
  .extend({ status: statusFilter, ...adminFilterShape })
  .strict();
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

export const userParamsSchema = z.object({ userId: objectIdSchema }).strict();
export type UserParams = z.infer<typeof userParamsSchema>;

// ---- Responses -------------------------------------------------------------------------------

const personSchema = z
  .object({ id: z.string(), fullName: z.string(), avatarUrl: z.string().nullable() })
  .openapi('DonationPerson');

const adminPersonSchema = personSchema
  .extend({ phone: z.string().openapi({ description: 'Masked (GB-35).' }), email: z.string() })
  .openapi('DonationAdminPerson');

const toySummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    imageUrl: z.string().nullable(),
    condition: z.string(),
    ageRange: z.object({ minAge: z.number(), maxAge: z.number() }).nullable(),
    status: z.enum(['pending', 'active', 'hidden', 'donated']).openapi({
      description:
        'Stored toy status, or donated once a request for it is confirmed (GB-60, derived).',
    }),
  })
  .openapi('DonationToy');

const receivingPointSummarySchema = z
  .object({
    province: z.string(),
    ward: z.string(),
    street: z.string(),
    openingHours: z.string(),
    acceptsDropOff: z.boolean(),
    acceptsParcel: z.boolean(),
  })
  .openapi('DonationReceivingPoint', {
    description:
      'Public part of the receiving point; its contact is in counterpartContact (GB-62).',
  });

const organizationSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    isAccepting: z.boolean(),
    receivingPoint: receivingPointSummarySchema.nullable(),
  })
  .openapi('DonationOrganization');

const adminOrganizationSchema = organizationSummarySchema
  .extend({
    address: z.string(),
    contactInfo: z.string(),
    supportCriteria: z.string().nullable(),
    receivingPoint: receivingPointSummarySchema
      .extend({ contactName: z.string(), contactPhone: z.string() })
      .nullable(),
  })
  .openapi('DonationAdminOrganization');

const counterpartContactSchema = z
  .object({ name: z.string(), phone: z.string().nullable() })
  .openapi('DonationCounterpartContact', {
    description:
      'D-03: full name and full phone (no email) of the other party, only while the request is ' +
      'ACCEPTED or SHIPPING and only for the Donor (sees the requesting user, or the ' +
      "organization's name and phone) and the requesting USER (sees the Donor). null otherwise, " +
      'and always null on admin routes (they carry masked contacts instead).',
  });

export const donationRequestSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    status: z.enum(storedDonationStatuses),
    receiverType: z.enum(donationReceiverTypes),
    message: z.string().nullable(),
    deliveryMethod: z.string(),
    decider: z.enum(['ADMIN', 'DONOR']).openapi({
      description:
        'GB-56: who accepts or rejects while pending. ADMIN for a request the Donor sent to an ' +
        'organization; DONOR otherwise.',
    }),
    handoverMethod: z.enum(handoverMethods).nullable(),
    carrierName: z.string().nullable(),
    trackingCode: z.string().nullable(),
    receipt: z
      .object({
        confirmedBy: z.string().nullable(),
        channel: z.enum(receiptChannels).nullable(),
        receivedAt: isoDateTimeSchema.nullable(),
      })
      .nullable()
      .openapi({ description: "GB-59: the organization's confirmation recorded by the Admin." }),
    dueAt: isoDateTimeSchema.nullable(),
    confirmDueAt: isoDateTimeSchema.nullable().openapi({
      description:
        'GB-57: while shipping, the handover date plus DONATION_CONFIRM_DAYS; null otherwise.',
    }),
    overdue: z.boolean().openapi({
      description:
        'GB-57: shipping and past confirmDueAt (flagged for the Admin, never confirmed).',
    }),
    toy: toySummarySchema.nullable(),
    donor: personSchema.nullable(),
    requester: personSchema.nullable(),
    organization: organizationSummarySchema.nullable(),
    counterpartContact: counterpartContactSchema.nullable(),
    decidedAt: isoDateTimeSchema.nullable(),
    rejectReason: z.string().nullable(),
    completedAt: isoDateTimeSchema.nullable(),
    expiredAt: isoDateTimeSchema.nullable().openapi({
      description: 'GB-57: when the expiry job (JOB-10) set the request to expired.',
    }),
    expiryReason: z.string().nullable().openapi({
      description: 'Why it expired (no decision, or no handover, in time); null otherwise.',
    }),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .openapi('DonationRequest');

const handoverSchema = z.object({
  step: z.enum(['DONOR_SENT', 'RECEIVER_RECEIVED']),
  by: z.string(),
  photos: z.array(z.string().nullable()).openapi({
    description: '5-minute signed links; null when storage is not configured.',
  }),
  note: z.string().nullable(),
  at: isoDateTimeSchema,
});

const historySchema = z.object({
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  reason: z.string().nullable(),
  at: isoDateTimeSchema,
});

const cancellationSchema = z.object({
  reason: z.string(),
  actorType: z.string(),
  by: z.string().nullable(),
  note: z.string().nullable(),
  at: isoDateTimeSchema,
});

export const donationRequestDetailSchema = donationRequestSchema
  .extend({
    decidedBy: z.string().nullable(),
    handovers: z.array(handoverSchema),
    cancellation: cancellationSchema.nullable(),
    history: z.array(historySchema),
  })
  .openapi('DonationRequestDetail');

export const adminDonationRequestDetailSchema = donationRequestDetailSchema
  .extend({
    donor: adminPersonSchema.nullable(),
    requester: adminPersonSchema.nullable(),
    organization: adminOrganizationSchema.nullable(),
  })
  .openapi('AdminDonationRequestDetail');

export const donationCountsSchema = z
  .record(z.enum(storedDonationStatuses), z.number().int())
  .openapi('DonationRequestCounts');

export const donorSummarySchema = z
  .object({ userId: z.string(), completedDonations: z.number().int() })
  .openapi('DonorDonationSummary');
