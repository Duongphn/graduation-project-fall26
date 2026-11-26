import { auditTargetTypes } from '../repositories/audit-log.repository.js';
import { isoDateTimeSchema, objectIdSchema, paginationQueryWithSort } from './common.validation.js';
import { z } from './zod.js';

// Admin Audit Log (UC31): read-only list with filters. There is no create, update or delete
// endpoint: entries are written by the actions themselves (writeAuditLog) and never changed.

export const auditLogSortFields = ['createdAt'] as const;

export const auditLogQuerySchema = paginationQueryWithSort(auditLogSortFields)
  .extend({
    actorId: objectIdSchema.optional().openapi({ description: 'The Admin who acted.' }),
    action: z
      .string()
      .trim()
      .regex(/^[a-z_]+(\.[a-z_]+)?$/, 'Mã thao tác không hợp lệ.')
      .optional()
      .openapi({
        description: 'An exact action ("toy.reject") or an area ("toy" = every toy.* action).',
        example: 'toy.reject',
      }),
    targetType: z.enum(auditTargetTypes).optional(),
    targetId: objectIdSchema.optional(),
    from: isoDateTimeSchema.optional().openapi({ description: 'From this time (inclusive).' }),
    to: isoDateTimeSchema.optional().openapi({ description: 'Up to this time (inclusive).' }),
  })
  .strict()
  .refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), {
    message: 'Thời điểm bắt đầu phải trước thời điểm kết thúc.',
    path: ['from'],
  });
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogItemSchema = z
  .object({
    id: z.string(),
    action: z.string().openapi({ example: 'user.lock' }),
    actor: z
      .object({ id: z.string(), fullName: z.string().nullable() })
      .nullable()
      .openapi({ description: 'Null for an action of a system job.' }),
    targetType: z.enum(auditTargetTypes),
    targetId: z.string().nullable(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .nullable()
      .openapi({ description: 'Short summary: a name, a reason, an old -> new value.' }),
    ipAddress: z.string().nullable(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('AuditLogItem');
export type AuditLogItem = z.infer<typeof auditLogItemSchema>;

export const auditLogFiltersSchema = z
  .object({
    actions: z.array(z.string()).openapi({ description: 'Every action written so far.' }),
    actors: z.array(z.object({ id: z.string(), fullName: z.string() })),
  })
  .openapi('AuditLogFilterOptions');
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;
