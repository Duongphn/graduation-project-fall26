import type { OrganizationStatus } from './domain/organization-rules.js';
import type { OrganizationRecord, RequestCounts } from './organizations.repository.js';

// API shapes of an organization. Stored with develop's field names (contact_info,
// support_criteria); the API uses camelCase.

const sharedFields = (record: OrganizationRecord) => ({
  id: String(record._id),
  name: record.name,
  address: record.address,
  contactInfo: record.contact_info,
  supportCriteria: record.support_criteria,
});

/** What Donors see. */
export const toPublicOrganization = (record: OrganizationRecord) => sharedFields(record);

/** What the Admin sees. */
export const toAdminOrganization = (record: OrganizationRecord, counts: RequestCounts) => ({
  ...sharedFields(record),
  status: record.status as OrganizationStatus,
  openRequestCount: counts.openRequestCount,
  requestCount: counts.requestCount,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export type AdminOrganizationDto = ReturnType<typeof toAdminOrganization>;
