import mongoose, { type Model, Schema } from 'mongoose';

const orderStatusHistorySchema = new Schema({
    orderType: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    oldStatus: { type: String },
    newStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
    occurredAt: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo Index đồng bộ tuyệt đối với Atlas
orderStatusHistorySchema.index({ orderType: 1, orderId: 1, occurredAt: 1 }, { name: 'order_timeline' });

export interface IOrderStatusHistory {
  _id: mongoose.Types.ObjectId;
  orderType: string;
  orderId: mongoose.Types.ObjectId;
  oldStatus?: string;
  newStatus: string;
  changedBy: mongoose.Types.ObjectId;
  notes?: string;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const OrderStatusHistory: Model<IOrderStatusHistory> =
  (mongoose.models.OrderStatusHistory as Model<IOrderStatusHistory>) ||
  mongoose.model<IOrderStatusHistory>('OrderStatusHistory', orderStatusHistorySchema);

export default OrderStatusHistory;
