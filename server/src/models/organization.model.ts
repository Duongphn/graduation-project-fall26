import mongoose, { type Model, Schema } from 'mongoose';

const organizationSchema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    contact_info: { type: String, required: true },
    support_criteria: { type: String, required: true },
    status: { type: String, required: true, default: 'active' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
organizationSchema.index({ name: 1 }, { unique: true, name: 'name_unique' });
organizationSchema.index({ status: 1, name: 1 }, { name: 'by_status' });

export interface IOrganization {
  _id: mongoose.Types.ObjectId;
  name: string;
  address: string;
  contact_info: string;
  support_criteria: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const Organization: Model<IOrganization> =
  (mongoose.models.Organization as Model<IOrganization>) ||
  mongoose.model<IOrganization>('Organization', organizationSchema);

export default Organization;
