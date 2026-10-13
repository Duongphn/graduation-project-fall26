const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema({
    actor_id: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    target_type: { type: String, required: true },
    target_id: { type: Schema.Types.ObjectId },
    ip_address: { type: String }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('AuditLog', auditLogSchema);