import mongoose, { Schema } from 'mongoose';

const auditLogSchema = new Schema({
    actor_id: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    target_type: { type: String, required: true },
    target_id: { type: Schema.Types.ObjectId },
    ip_address: { type: String }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
