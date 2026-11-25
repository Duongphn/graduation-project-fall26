import mongoose, { Document, Model, Schema, type Types } from 'mongoose';

export interface ISystemSetting extends Document {
  key: string;
  value: string;
  description?: string;
  /** Admin who made the last change (UC30, R04 3.25 updated_by) */
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    description: { type: String },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo Index đồng bộ tuyệt đối với Atlas
systemSettingSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });

export const SystemSetting: Model<ISystemSetting> =
  (mongoose.models.SystemSetting as Model<ISystemSetting>) ||
  mongoose.model<ISystemSetting>('SystemSetting', systemSettingSchema);

export default SystemSetting;
