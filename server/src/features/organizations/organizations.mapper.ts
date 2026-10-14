import type { AgeGroup } from '../../shared/domain/enums.js';
import type { VisibilityStatus } from '../../shared/domain/statuses.js';
import { maskPhone } from '../../shared/utils/phone.js';
import type { OrganizationRecord, RequestCounts } from './organizations.repository.js';

// API shapes of an organization. Absent optional values are returned as null.

const sharedFields = (record: OrganizationRecord) => ({
  id: String(record._id),
  name: record.name,
  address: record.address,
  province: record.province ?? null,
  contactInfo: record.contactInfo,
  supportCriteria: record.supportCriteria,
  description: record.description ?? null,
  ageGroups: (record.ageGroups ?? []) as AgeGroup[],
  logoUrl: record.logoUrl ?? null,
});

/** What Donors see. The phone only goes to signed-in callers (optionalAuth). */
export const toPublicOrganization = (
  record: OrganizationRecord,
  options: { includePhone: boolean },
) => ({
  ...sharedFields(record),
  ...(options.includePhone && record.phone ? { phone: record.phone } : {}),
});

/** What the Admin sees. Lists carry only the masked phone (GB-35). */
export const toAdminOrganization = (
  record: OrganizationRecord,
  counts: RequestCounts,
  options: { includePhone: boolean },
) => ({
  ...sharedFields(record),
  phoneMasked: maskPhone(record.phone),
  ...(options.includePhone && record.phone ? { phone: record.phone } : {}),
  status: record.status as VisibilityStatus,
  openRequestCount: counts.openRequestCount,
  requestCount: counts.requestCount,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export type AdminOrganizationDto = ReturnType<typeof toAdminOrganization>;

/** The values kept in audit logs (phone masked, GB-35). */
export const toAuditView = (record: OrganizationRecord) => ({
  name: record.name,
  address: record.address,
  province: record.province ?? null,
  contactInfo: record.contactInfo,
  supportCriteria: record.supportCriteria,
  description: record.description ?? null,
  ageGroups: record.ageGroups ?? [],
  logoUrl: record.logoUrl ?? null,
  phone: maskPhone(record.phone),
  status: record.status,
});
