import { z } from 'zod'

import { withdrawalStatuses } from '../../constants/domain'

// Filters of the withdrawal queue read from the URL (?status=completed). Default: the pending ones.
export const withdrawalFiltersSchema = z.object({
  status: z.enum(['all', ...withdrawalStatuses]).catch('pending'),
})

// Quick reasons for refusing a request (the Admin can still type their own).
export const WITHDRAWAL_REJECT_PRESETS = [
  'Tên chủ tài khoản không khớp với ngân hàng',
  'Số tài khoản không tồn tại hoặc không nhận được tiền',
  'Thông tin ngân hàng không khớp với người dùng',
  'Nghi ngờ gian lận, cần xác minh thêm',
] as const
