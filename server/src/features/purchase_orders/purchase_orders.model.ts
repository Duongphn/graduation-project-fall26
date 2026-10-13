import mongoose, { Schema } from 'mongoose';

const purchaseOrderSchema = new Schema({
    code: { type: String, required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    itemDetails: { type: String, required: true },
    price: { type: Number, required: true },
    deliveryMethod: { type: String, required: true },
    status: { type: String, required: true, default: 'pending' },
    timer: {
        dueAt: { type: Date }
    }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tao cac Index dong bo tuyet doi voi Atlas
purchaseOrderSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
purchaseOrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 }, { name: 'buyer_orders' });
purchaseOrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 }, { name: 'seller_orders' });
purchaseOrderSchema.index({ toyId: 1, status: 1 }, { name: 'toy_orders' });
purchaseOrderSchema.index({ 'timer.dueAt': 1 }, { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' });

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);
