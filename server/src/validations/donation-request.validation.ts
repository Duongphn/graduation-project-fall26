import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  privateImageInputSchema,
  reasonSchema,
  searchQuerySchema,
} from './common.validation.js';
import { z } from './zod.js';
import { storedDonationStatuses } from '../constants/donation-request-transitions.js';

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

export const handoverBodySchema = z
  .object({ photos: photosSchema, note: noteSchema })
  .strict()
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
  .object({ photos: photosSchema.optional(), note: noteSchema, reason: reasonSchema.optional() })
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
    status: z.enum(['pending', 'active', 'hidden']),
  })
  .openapi('DonationToy');

const organizationSummarySchema = z
  .object({ id: z.string(), name: z.string(), status: z.string() })
  .openapi('DonationOrganization');

const adminOrganizationSchema = organizationSummarySchema
  .extend({
    address: z.string(),
    contactInfo: z.string(),
    supportCriteria: z.string(),
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
    dueAt: isoDateTimeSchema.nullable(),
    toy: toySummarySchema.nullable(),
    donor: personSchema.nullable(),
    requester: personSchema.nullable(),
    organization: organizationSummarySchema.nullable(),
    counterpartContact: counterpartContactSchema.nullable(),
    decidedAt: isoDateTimeSchema.nullable(),
    rejectReason: z.string().nullable(),
    completedAt: isoDateTimeSchema.nullable(),
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
