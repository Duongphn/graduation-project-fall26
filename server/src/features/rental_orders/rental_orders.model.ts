import mongoose, { type Model, Schema } from 'mongoose';

const rentalOrderSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    renterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    period: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    rentalFee: { type: Number, required: true },
    depositAmount: { type: Number, required: true },
    status: { type: String, required: true, default: 'pending' },
    timer: {
      dueAt: { type: Date },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
rentalOrderSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
rentalOrderSchema.index({ renterId: 1, createdAt: -1 }, { name: 'renter_orders' });
rentalOrderSchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_orders' });
rentalOrderSchema.index({ toyId: 1, status: 1, 'period.startDate': 1 }, { name: 'toy_calendar' });
rentalOrderSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export interface IRentalOrder {
  code: string;
  renterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  toyId: mongoose.Types.ObjectId;
  period: {
    startDate: Date;
    endDate: Date;
  };
  rentalFee: number;
  depositAmount: number;
  status: string;
  timer?: {
    dueAt?: Date;
  };
}

export const RentalOrder: Model<IRentalOrder> =
  (mongoose.models.RentalOrder as Model<IRentalOrder>) ||
  mongoose.model<IRentalOrder>('RentalOrder', rentalOrderSchema);

export default RentalOrder;
