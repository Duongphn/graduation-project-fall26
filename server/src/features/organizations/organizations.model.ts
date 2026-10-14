import { Schema, model, type InferSchemaType } from 'mongoose';

import { vietnameseNameCollation } from '../../infrastructure/database/schema-types.js';
import { ageGroups } from '../../shared/domain/enums.js';
import { vietnamProvinces } from '../../shared/domain/provinces.js';
import { visibilityStatuses } from '../../shared/domain/statuses.js';

// Charity groups added and checked by the Admin (FE-02). An organization with open
// donation requests is hidden, never deleted (checked in the service).
// province, phone, ageGroups, logoUrl and description were added later: they are optional in
// the schema so earlier documents stay valid; the API requires province and phone. The phone
// is shown masked in public lists (GB-35).
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    contactInfo: { type: String, required: true, trim: true },
    supportCriteria: { type: String, required: true, trim: true },
    province: { type: String, enum: vietnamProvinces },
    // E.164, e.g. +84912345678 (normalizeVietnamPhone).
    phone: { type: String, trim: true, match: /^\+84[1-9]\d{8}$/ },
    // Age groups the organization accepts toys for (same values as toys.ageGroup).
    ageGroups: { type: [{ type: String, enum: ageGroups }], default: [] },
    // Cloudinary secure_url of a signed upload.
    logoUrl: { type: String, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: visibilityStatuses, required: true, default: 'ACTIVE' },
  },
  { collection: 'organizations', timestamps: true },
);

organizationSchema.index(
  { name: 1 },
  { unique: true, collation: vietnameseNameCollation, name: 'name_unique' },
);
organizationSchema.index({ status: 1, name: 1 }, { name: 'by_status' });
// Public list filtered by province.
organizationSchema.index(
  { status: 1, province: 1, name: 1 },
  { collation: vietnameseNameCollation, name: 'public_list' },
);
organizationSchema.index({ status: 1, ageGroups: 1 }, { name: 'by_age_group' });

export type Organization = InferSchemaType<typeof organizationSchema>;
export const OrganizationModel = model('Organization', organizationSchema);
