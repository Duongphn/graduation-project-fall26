import { z } from 'zod'

import { visibilityStatuses } from '../../constants/domain'
import { enumParam, searchParam } from '../../schemas/list-params'
import { ageGroupKey, organizationAgeGroups } from './constants'
import type { Organization, OrganizationInput } from './types'

// Mirrors createOrganizationBodySchema in server/src/validations/organization.validation.ts.
const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, message)

const ageGroupKeys = organizationAgeGroups.map((group) => group.key) as [string, ...string[]]

export const organizationFormSchema = z.object({
  name: text(2, 150, 'Tên tổ chức cần từ 2 đến 150 ký tự.'),
  address: text(5, 300, 'Địa chỉ cần từ 5 đến 300 ký tự.'),
  contactInfo: text(2, 300, 'Thông tin liên hệ cần từ 2 đến 300 ký tự.'),
  // Optional free-text note next to the structured needs.
  supportCriteria: z
    .string()
    .trim()
    .refine((value) => value === '' || (value.length >= 5 && value.length <= 1000), {
      message: 'Ghi chú nhu cầu cần từ 5 đến 1000 ký tự.',
    }),
  // GB-51: the one receiving point (no district since 01/07/2025).
  receivingPoint: z
    .object({
      province: text(2, 100, 'Tỉnh/Thành phố cần từ 2 đến 100 ký tự.'),
      ward: text(2, 100, 'Phường/Xã cần từ 2 đến 100 ký tự.'),
      street: text(3, 120, 'Số nhà và tên đường cần từ 3 đến 120 ký tự.'),
      openingHours: text(2, 200, 'Giờ nhận cần từ 2 đến 200 ký tự.'),
      contactName: z
        .string()
        .trim()
        .regex(/^[\p{L} ]{2,50}$/u, 'Tên người liên hệ chỉ gồm chữ và khoảng trắng, 2 đến 50 ký tự.'),
      contactPhone: z
        .string()
        .trim()
        .regex(/^0\d{9}$|^\+84\d{9}$/, 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.'),
      acceptsDropOff: z.boolean(),
      acceptsParcel: z.boolean(),
    })
    .refine((point) => point.acceptsDropOff || point.acceptsParcel, {
      message: 'Chọn ít nhất một cách bàn giao.',
      path: ['acceptsDropOff'],
    }),
  // GB-53: the needs profile.
  ageGroups: z.array(z.enum(ageGroupKeys)).min(1, 'Chọn ít nhất một nhóm tuổi.'),
  categoryIds: z.array(z.string()).min(1, 'Chọn ít nhất một danh mục.'),
  areaProvince: z
    .string()
    .trim()
    .refine((value) => value === '' || (value.length >= 2 && value.length <= 100), {
      message: 'Khu vực cần từ 2 đến 100 ký tự.',
    }),
  isRemoteArea: z.boolean(),
  isAccepting: z.boolean(),
})

export type OrganizationFormInput = z.input<typeof organizationFormSchema>
export type OrganizationFormValues = z.output<typeof organizationFormSchema>

export const emptyOrganizationForm: OrganizationFormInput = {
  name: '',
  address: '',
  contactInfo: '',
  supportCriteria: '',
  receivingPoint: {
    province: '',
    ward: '',
    street: '',
    openingHours: '',
    contactName: '',
    contactPhone: '',
    acceptsDropOff: true,
    acceptsParcel: false,
  },
  ageGroups: [],
  categoryIds: [],
  areaProvince: '',
  isRemoteArea: false,
  isAccepting: true,
}

/** "+84912345678" -> "0912345678" for the form. */
const localPhone = (phone: string) => phone.replace(/^\+84/, '0')

// An organization saved before 17/11/2026 has no receiving point: the form starts it empty.
export const toFormValues = (organization: Organization): OrganizationFormInput => ({
  name: organization.name,
  address: organization.address,
  contactInfo: organization.contactInfo,
  supportCriteria: organization.supportCriteria ?? '',
  receivingPoint: organization.receivingPoint
    ? {
        ...organization.receivingPoint,
        contactPhone: localPhone(organization.receivingPoint.contactPhone),
      }
    : emptyOrganizationForm.receivingPoint,
  ageGroups: organization.ageGroups.map(ageGroupKey),
  categoryIds: organization.categoryIds,
  areaProvince: organization.areaProvince ?? '',
  isRemoteArea: organization.isRemoteArea,
  isAccepting: organization.isAccepting,
})

export const toInput = ({
  supportCriteria,
  areaProvince,
  ageGroups,
  ...values
}: OrganizationFormValues): OrganizationInput => ({
  ...values,
  ...(supportCriteria ? { supportCriteria } : {}),
  ...(areaProvince ? { areaProvince } : {}),
  ageGroups: organizationAgeGroups
    .filter((group) => ageGroups.includes(group.key))
    .map(({ minAge, maxAge }) => ({ minAge, maxAge })),
})

// Filters of the list read from the URL (useListParams).
export const organizationFiltersSchema = z.object({
  status: enumParam(visibilityStatuses),
  q: searchParam,
})
