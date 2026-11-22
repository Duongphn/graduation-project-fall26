import {
  lockDurations,
  MAX_REPORT_EVIDENCE,
  reportActions,
  reportReasons,
  reportStatuses,
  reportTargetKinds,
  UNSAFE_REASON,
  unsafeIssues,
} from '../constants/violation-report.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
  privateImageInputSchema,
} from './common.validation.js';
import { z } from './zod.js';

// Violation reports: a User reports a toy post, a user or a message (UC28); an Admin handles the
// report (UC29). The same schemas validate the requests and document them in Swagger.

/**
 * Evidence photos are private uploads with the REPORT_EVIDENCE purpose: the uploads feature signs
 * the public_id "toyflow/reports/<uploader id>/<random>". The service checks the uploader is the
 * reporter.
 */
export const REPORT_EVIDENCE_PATTERN = /^toyflow\/reports\/([a-f0-9]{24})\/[A-Za-z0-9_-]{1,64}$/;

const evidenceSchema = privateImageInputSchema.refine(
  (photo) => REPORT_EVIDENCE_PATTERN.test(photo.publicId),
  { message: 'Ảnh bằng chứng phải được tải lên với mục đích REPORT_EVIDENCE.' },
);

export const createReportBodySchema = z
  .object({
    targetKind: z.enum(reportTargetKinds).openapi({
      description: 'toy = a toy post, user = an account, message = one chat message.',
    }),
    targetId: objectIdSchema,
    reason: z.enum(reportReasons).openapi({
      description: 'unsafe_toy only for a toy post; it puts the report first in the Admin list.',
    }),
    unsafeIssues: z
      .array(z.enum(unsafeIssues))
      .min(1)
      .max(unsafeIssues.length)
      .optional()
      .openapi({ description: 'Required with reason unsafe_toy, not allowed otherwise.' }),
    description: z.string().trim().min(10).max(1000).openapi({
      example: 'Bánh xe bị nứt, có cạnh sắc có thể làm bé đứt tay.',
    }),
    evidence: z.array(evidenceSchema).max(MAX_REPORT_EVIDENCE).optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.reason === UNSAFE_REASON && body.targetKind !== 'toy') {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Lý do "Đồ chơi không an toàn" chỉ dùng cho tin đăng đồ chơi.',
      });
    }
    if (body.reason === UNSAFE_REASON && !body.unsafeIssues?.length) {
      context.addIssue({
        code: 'custom',
        path: ['unsafeIssues'],
        message: 'Vui lòng chọn ít nhất một vấn đề an toàn.',
      });
    }
    if (body.reason !== UNSAFE_REASON && body.unsafeIssues?.length) {
      context.addIssue({
        code: 'custom',
        path: ['unsafeIssues'],
        message: 'Chỉ chọn vấn đề an toàn khi lý do là "Đồ chơi không an toàn".',
      });
    }
  })
  .openapi('CreateViolationReportRequest');
export type CreateReportBody = z.infer<typeof createReportBodySchema>;

export const createdReportSchema = z
  .object({
    id: z.string(),
    targetKind: z.enum(reportTargetKinds),
    targetId: z.string(),
    reason: z.enum(reportReasons),
    status: z.literal('pending'),
    createdAt: isoDateTimeSchema,
  })
  .openapi('CreatedViolationReport');
export type CreatedReport = z.infer<typeof createdReportSchema>;

// ---- Admin ----

export const adminReportListQuerySchema = paginationQuerySchema
  .omit({ sortBy: true })
  .extend({
    status: z.enum(reportStatuses).default('pending'),
    reason: z.enum(reportReasons).optional(),
    targetKind: z.enum(reportTargetKinds).optional(),
    reportedUserId: objectIdSchema.optional(),
  })
  .strict();
export type AdminReportListQuery = z.infer<typeof adminReportListQuerySchema>;

export const adminReportCountsQuerySchema = z
  .object({
    reason: z.enum(reportReasons).optional(),
    targetKind: z.enum(reportTargetKinds).optional(),
  })
  .strict();
export type AdminReportCountsQuery = z.infer<typeof adminReportCountsQuerySchema>;

/** Reason sent to the user: 20 to 300 characters for a lock (R03 III.7.2.1 (9)), else 5 to 300. */
export const resolveReportBodySchema = z
  .object({
    action: z.enum(reportActions).openapi({
      description:
        'dismiss: no violation. remove_listing: hide the reported toy post (toy reports only). ' +
        'warn: warn the reported user. lock: lock the reported user (lockDuration required).',
    }),
    lockDuration: z.enum(lockDurations).optional(),
    note: z.string().trim().min(5).max(300).openapi({
      description: 'Shown to the reported user (and the reporter for dismiss).',
      example: 'Tin đăng có chi tiết nhỏ không phù hợp với trẻ dưới 3 tuổi.',
    }),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.action === 'lock' && !body.lockDuration) {
      context.addIssue({
        code: 'custom',
        path: ['lockDuration'],
        message: 'Vui lòng chọn thời hạn khóa.',
      });
    }
    if (body.action !== 'lock' && body.lockDuration) {
      context.addIssue({
        code: 'custom',
        path: ['lockDuration'],
        message: 'Thời hạn khóa chỉ dùng khi khóa tài khoản.',
      });
    }
    if (body.action === 'lock' && body.note.length < 20) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Lý do khóa tài khoản cần từ 20 đến 300 ký tự.',
      });
    }
  })
  .openapi('ResolveViolationReportRequest');
export type ResolveReportBody = z.infer<typeof resolveReportBodySchema>;

const personSchema = z
  .object({ id: z.string(), fullName: z.string().nullable() })
  .openapi('ReportPerson');

const resolutionSchema = z
  .object({
    action: z.enum(reportActions),
    lockDuration: z.enum(lockDurations).nullable(),
    note: z.string().nullable(),
    resolvedAt: isoDateTimeSchema.nullable(),
    resolvedBy: personSchema.nullable(),
    viaReportId: z.string().nullable(),
  })
  .openapi('ViolationReportResolution');

export const adminReportListItemSchema = z
  .object({
    id: z.string(),
    status: z.enum(reportStatuses),
    reason: z.enum(reportReasons),
    isUnsafe: z.boolean(),
    unsafeIssues: z.array(z.enum(unsafeIssues)),
    description: z.string(),
    target: z.object({
      kind: z.enum(reportTargetKinds),
      id: z.string(),
      label: z.string().nullable().openapi({
        description: 'Toy title, user name or the start of the message; null when it is gone.',
      }),
    }),
    reporter: personSchema.nullable(),
    reportedUser: personSchema.nullable(),
    evidenceCount: z.number().int(),
    resolution: resolutionSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('ViolationReportListItem');
export type AdminReportListItem = z.infer<typeof adminReportListItemSchema>;

export const reportStatusCountsSchema = z
  .record(z.enum(reportStatuses), z.number().int())
  .openapi('ViolationReportStatusCounts');
export type ReportStatusCounts = z.infer<typeof reportStatusCountsSchema>;

const reportedUserDetailSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    maskedPhone: z.string(),
    role: z.enum(['USER', 'ADMIN']),
    accountStatus: z.enum(['ACTIVE', 'LOCKED']),
    lockedUntil: isoDateTimeSchema.nullable(),
    violationCount: z.number().int().openapi({ description: 'Resolved reports against the user.' }),
    pendingReportCount: z.number().int(),
  })
  .openapi('ReportedUserSummary');

export const adminReportDetailSchema = adminReportListItemSchema
  .extend({
    reporter: personSchema.extend({ maskedPhone: z.string() }).nullable(),
    reportedUser: reportedUserDetailSchema.nullable(),
    toy: z
      .object({
        id: z.string(),
        title: z.string(),
        status: z.enum(['pending', 'active', 'hidden']),
        listingType: z.string(),
        coverImage: z.string().nullable(),
        rejectReason: z.string().nullable(),
      })
      .nullable()
      .openapi({ description: 'The reported toy post (toy reports).' }),
    message: z
      .object({
        id: z.string(),
        content: z.string(),
        sentAt: isoDateTimeSchema,
        conversationId: z.string(),
      })
      .nullable()
      .openapi({ description: 'The reported message (message reports), shown as evidence.' }),
    evidence: z.array(
      z.object({ url: z.string().nullable(), expiresAt: isoDateTimeSchema.nullable() }),
    ),
    otherPendingReports: z.number().int().openapi({
      description: 'Other pending reports on the same target; they are closed with this one.',
    }),
  })
  .openapi('ViolationReportDetail');
export type AdminReportDetail = z.infer<typeof adminReportDetailSchema>;

export const resolveReportResultSchema = z
  .object({
    id: z.string(),
    status: z.enum(['resolved', 'dismissed']),
    action: z.enum(reportActions),
    closedReportIds: z.array(z.string()).openapi({
      description: 'Every report closed by this decision (this one and the other pending ones).',
    }),
  })
  .openapi('ResolveViolationReportResult');
export type ResolveReportResult = z.infer<typeof resolveReportResultSchema>;
