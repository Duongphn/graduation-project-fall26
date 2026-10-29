import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISystemSetting extends Document {
  key: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    description: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo Index đồng bộ tuyệt đối với Atlas
systemSettingSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });

export const SystemSetting: Model<ISystemSetting> =
  (mongoose.models.SystemSetting as Model<ISystemSetting>) ||
  mongoose.model<ISystemSetting>('SystemSetting', systemSettingSchema);

export default SystemSetting;
