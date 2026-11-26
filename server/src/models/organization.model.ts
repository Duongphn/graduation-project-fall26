import mongoose, { type Model, Schema } from 'mongoose';

// R04 3.8 charity_organizations. The receiving point and the needs profile (GB-51, GB-53) were
// added on 17/11/2026; documents saved before that have none of them, so every new field is
// optional or defaulted and the readers treat a missing value as its default
// (`npm run db:backfill-organizations` writes the defaults).

/** The one receiving point of an organization (R04 3.8 point_*). No district (since 01/07/2025). */
const receivingPointSchema = new Schema(
  {
    province: { type: String, required: true },
    ward: { type: String, required: true },
    street: { type: String, required: true },
    openingHours: { type: String, required: true },
    // GB-62: shown to a Donor only while their request is accepted or shipping.
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    acceptsDropOff: { type: Boolean, required: true, default: false },
    acceptsParcel: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/** One accepted age group, stored like a toy's ageRange: years, [minAge, maxAge). */
const ageGroupSchema = new Schema(
  {
    minAge: { type: Number, required: true },
    maxAge: { type: Number, required: true },
  },
  { _id: false },
);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    contact_info: { type: String, required: true },
    // Free-text note on what the organization needs; the structured needs are below.
    support_criteria: { type: String },
    status: { type: String, required: true, default: 'active' },
    // UC34: what the Admin checked before adding it, and when (R04 3.8 verification_note,
    // verified_at). Organizations saved before 18/11/2026 have neither.
    verificationNote: { type: String },
    verifiedAt: { type: Date },
    receivingPoint: { type: receivingPointSchema, default: undefined },
    // Needs profile (GB-53).
    ageGroups: { type: [ageGroupSchema], default: undefined },
    categoryIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Category' }], default: undefined },
    areaProvince: { type: String },
    isRemoteArea: { type: Boolean, default: false },
    // GB-55: while false, the organization takes no new requests.
    isAccepting: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
organizationSchema.index({ name: 1 }, { unique: true, name: 'name_unique' });
organizationSchema.index({ status: 1, name: 1 }, { name: 'by_status' });

export interface IOrganizationReceivingPoint {
  province: string;
  ward: string;
  street: string;
  openingHours: string;
  contactName: string;
  contactPhone: string;
  acceptsDropOff: boolean;
  acceptsParcel: boolean;
}

export interface IOrganization {
  _id: mongoose.Types.ObjectId;
  name: string;
  address: string;
  contact_info: string;
  support_criteria?: string;
  status: string;
  verificationNote?: string;
  verifiedAt?: Date;
  receivingPoint?: IOrganizationReceivingPoint;
  ageGroups?: Array<{ minAge: number; maxAge: number }>;
  categoryIds?: mongoose.Types.ObjectId[];
  areaProvince?: string;
  isRemoteArea?: boolean;
  isAccepting?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const Organization: Model<IOrganization> =
  (mongoose.models.Organization as Model<IOrganization>) ||
  mongoose.model<IOrganization>('Organization', organizationSchema);

export default Organization;
