import { z } from 'zod'

import { visibilityStatuses } from '../../constants/domain'
import { enumParam, searchParam } from '../../schemas/list-params'

// Same limits as the backend (categories.schemas.ts); the server still decides duplicates.
export const CATEGORY_NAME_MAX = 100
export const CATEGORY_DESCRIPTION_MAX = 500
export const CATEGORY_DISPLAY_ORDER_MAX = 1_000_000

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Tên danh mục cần ít nhất 2 ký tự.')
    .max(CATEGORY_NAME_MAX, `Tên danh mục tối đa ${CATEGORY_NAME_MAX} ký tự.`),
  description: z
    .string()
    .trim()
    .max(CATEGORY_DESCRIPTION_MAX, `Mô tả tối đa ${CATEGORY_DESCRIPTION_MAX} ký tự.`),
  // Empty when creating: the new category goes to the end of the list.
  displayOrder: z
    .number('Thứ tự hiển thị phải là số.')
    .int('Thứ tự hiển thị phải là số nguyên.')
    .min(0, 'Thứ tự hiển thị không được âm.')
    .max(CATEGORY_DISPLAY_ORDER_MAX, 'Thứ tự hiển thị quá lớn.')
    .nullable(),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

// Filters of the list read from the URL (useListParams).
export const categoryFiltersSchema = z.object({
  status: enumParam(visibilityStatuses),
  q: searchParam,
})
