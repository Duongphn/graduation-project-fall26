import { compensationRates, disputeRulings } from '../constants/dispute-ruling.js';
import { paginationQuerySchema } from './common.validation.js';
import { z } from './zod.js';

// Admin giải quyết khiếu nại đơn thuê (UC19, R03 III.7.4.1).

export const DISPUTE_DECISION_MIN = 30;
export const DISPUTE_DECISION_MAX = 500;

export const disputeListQuerySchema = paginationQuerySchema
  .pick({ page: true, limit: true })
  .extend({
    status: z.enum(['open', 'resolved']).default('open').openapi({
      description: 'open: chờ quyết định (cũ nhất trước); resolved: đã có phán quyết (mới nhất trước).',
    }),
  })
  .strict();
export type DisputeListQuery = z.infer<typeof disputeListQuerySchema>;

export const resolveDisputeBodySchema = z
  .object({
    ruling: z.enum(disputeRulings, { error: 'Vui lòng chọn phán quyết.' }),
    compensationRate: z.literal([...compensationRates], {
      error: 'Tỷ lệ bồi thường chỉ được là 0%, 25%, 50%, 75% hoặc 100%.',
    }),
    adminDecision: z
      .string({ error: 'Vui lòng nhập lý do phán quyết.' })
      .trim()
      .min(DISPUTE_DECISION_MIN, { error: `Lý do phán quyết cần ít nhất ${DISPUTE_DECISION_MIN} ký tự.` })
      .max(DISPUTE_DECISION_MAX, { error: `Lý do phán quyết tối đa ${DISPUTE_DECISION_MAX} ký tự.` }),
  })
  .strict()
  .openapi('ResolveDisputeBody');
export type ResolveDisputeBody = z.infer<typeof resolveDisputeBodySchema>;
