const mongoose = require('mongoose');
const { Schema } = mongoose;

const categorySchema = new Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    parent_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    description: { type: String },
    status: { type: String, required: true, default: 'active' },
    displayOrder: { type: Number, required: true, default: 0 }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ với Atlas
categorySchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
categorySchema.index({ name: 1 }, { unique: true, name: 'name_unique' });
categorySchema.index({ status: 1, displayOrder: 1 }, { name: 'menu_order' });

module.exports = mongoose.model('Category', categorySchema);