const mongoose = require('mongoose');
const { Schema } = mongoose;

const toySchema = new Schema({
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    condition: { type: String, required: true },
    listingType: { type: String, required: true },
    priceOrRate: { type: Number, required: true },
    depositPrice: { type: Number },
    status: { type: String, required: true, default: 'active' },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    moderation: {
        submittedAt: { type: Date }
    }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
toySchema.index({ status: 1, categoryId: 1, createdAt: -1 }, { name: 'browse_by_category' });
toySchema.index({ status: 1, listingType: 1, createdAt: -1 }, { name: 'browse_by_type' });
toySchema.index({ location: '2dsphere', status: 1, listingType: 1 }, { name: 'near_me' });
toySchema.index({ title: 'text', description: 'text' }, { name: 'keyword_search' });
toySchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_toys' });
toySchema.index({ "moderation.submittedAt": 1 }, { partialFilterExpression: { "moderation.submittedAt": { $exists: true } }, name: 'moderation_queue' });

module.exports = mongoose.model('Toy', toySchema);