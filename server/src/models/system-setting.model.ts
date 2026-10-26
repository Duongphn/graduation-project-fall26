import mongoose, { Schema } from 'mongoose';

const systemSettingSchema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    description: { type: String }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo Index đồng bộ tuyệt đối với Atlas
systemSettingSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });

export const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', systemSettingSchema);

export default SystemSetting;
