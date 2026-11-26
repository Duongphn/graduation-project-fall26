import type { OrganizationStatus } from '../constants/organization-rules.js';
import type { OrganizationRecord, RequestCounts } from '../repositories/organization.repository.js';

// API shapes of an organization. Stored with develop's field names (contact_info,
// support_criteria) plus the camelCase receiving point and needs profile; the API uses
// camelCase. A field missing on an organization saved before 17/11/2026 reads as its default.

const needsOf = (record: OrganizationRecord) => ({
  ageGroups: (record.ageGroups ?? []).map(({ minAge, maxAge }) => ({ minAge, maxAge })),
  categoryIds: (record.categoryIds ?? []).map(String),
  areaProvince: record.areaProvince ?? record.receivingPoint?.province ?? null,
  isRemoteArea: record.isRemoteArea ?? false,
  isAccepting: record.isAccepting ?? true,
});

const sharedFields = (record: OrganizationRecord) => ({
  id: String(record._id),
  name: record.name,
  address: record.address,
  supportCriteria: record.support_criteria ?? null,
  ...needsOf(record),
});

/** GB-62: the address and opening hours are public, the contact is not. */
const publicPoint = (record: OrganizationRecord) => {
  const point = record.receivingPoint;
  if (!point) return null;
  return {
    province: point.province,
    ward: point.ward,
    street: point.street,
    openingHours: point.openingHours,
    acceptsDropOff: point.acceptsDropOff,
    acceptsParcel: point.acceptsParcel,
  };
};

/** What Donors and Guests see: no contact details (GB-62). */
export const toPublicOrganization = (record: OrganizationRecord) => ({
  ...sharedFields(record),
  receivingPoint: publicPoint(record),
});

export type PublicOrganizationDto = ReturnType<typeof toPublicOrganization>;

/** What the Admin sees. */
export const toAdminOrganization = (record: OrganizationRecord, counts: RequestCounts) => {
  const point = publicPoint(record);
  return {
    ...sharedFields(record),
    contactInfo: record.contact_info,
    receivingPoint:
      point && record.receivingPoint
        ? {
            ...point,
            contactName: record.receivingPoint.contactName,
            contactPhone: record.receivingPoint.contactPhone,
          }
        : null,
    status: record.status as OrganizationStatus,
    verificationNote: record.verificationNote ?? null,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    openRequestCount: counts.openRequestCount,
    requestCount: counts.requestCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

export type AdminOrganizationDto = ReturnType<typeof toAdminOrganization>;
