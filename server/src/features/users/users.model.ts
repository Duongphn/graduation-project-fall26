const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    phone: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, required: true, default: 'user' },
    status: { type: String, required: true, default: 'active' },
    trust: {
        review: {
            requestedAt: { type: Date }
        }
    },
    lock: {
        until: { type: Date }
    }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
userSchema.index({ phone: 1 }, { unique: true, name: 'phone_unique' });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null } }, name: 'email_unique' });
userSchema.index({ role: 1, status: 1, createdAt: -1 }, { name: 'admin_user_list' });
userSchema.index({ "trust.review.requestedAt": 1 }, { partialFilterExpression: { "trust.review.requestedAt": { $exists: true } }, name: 'trust_review_queue' });
userSchema.index({ "lock.until": 1 }, { partialFilterExpression: { "lock.until": { $exists: true } }, name: 'lock_expiry' });

module.exports = mongoose.model('User', userSchema);