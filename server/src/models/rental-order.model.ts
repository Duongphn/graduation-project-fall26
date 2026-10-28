import mongoose, { type HydratedDocument, type Model, Schema, Types } from 'mongoose';
import {
  rentalOrderStatuses,
  type RentalOrderStatus,
  rentalTimerKinds,
  type RentalTimerKind,
} from '../constants/rental-order-status.js';
import {
  type RentalCancelActor,
  rentalCancelActors,
} from '../types/order-cancel.types.js';
import { type RentalPricing } from '../types/rental-order.types.js';

export interface RentalPhoto {
  url: string;
  publicId: string;
}

export interface IRentalOrder {
  _id: Types.ObjectId;
  code: string;
  renterId: Types.ObjectId;
  ownerId: Types.ObjectId;
  toyId: Types.ObjectId;
  period: {
    startDate: Date;
    endDate: Date;
  };
  pricing: RentalPricing;
  status: RentalOrderStatus;
  timer?: {
    kind: RentalTimerKind;
    dueAt: Date;
  };
  rejectionReason?: string;
  cancellation?: {
    by: RentalCancelActor;
    userId: Types.ObjectId;
    reason: string;
    fee: number;
    cancelledAt: Date;
  };
  handover?: {
    ownerPhotos: RentalPhoto[];
    shippedAt?: Date;
    renterPhotos: RentalPhoto[];
    receivedAt?: Date;
    autoConfirmed?: boolean;
  };
  rentalStartedAt?: Date;
  returnInfo?: {
    photos: RentalPhoto[];
    note?: string;
    requestedAt: Date;
    lateDays: number;
    lateFee: number;
  };
  settlement?: {
    result: 'GOOD' | 'DAMAGED';
    evidencePhotos?: RentalPhoto[];
    description?: string;
    settledAt: Date;
    autoSettled?: boolean;
    disputeId?: Types.ObjectId;
  };
  lastReminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RentalOrderDoc = HydratedDocument<IRentalOrder>;

const photoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

const pricingSchema = new Schema(
  {
    days: { type: Number, required: true },
    dailyRate: { type: Number, required: true },
    rentalFee: { type: Number, required: true },
    depositAmount: { type: Number, required: true },
    platformFeeRate: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    totalPayable: { type: Number, required: true },
  },
  { _id: false },
);

const rentalOrderSchema = new Schema<IRentalOrder>(
  {
    code: { type: String, required: true },
    renterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    period: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    pricing: { type: pricingSchema, required: true },
    status: {
      type: String,
      required: true,
      enum: rentalOrderStatuses,
      default: 'PENDING',
    },
    timer: {
      kind: { type: String, enum: rentalTimerKinds },
      dueAt: { type: Date },
    },
    rejectionReason: { type: String },
    cancellation: {
      by: { type: String, enum: rentalCancelActors },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: { type: String },
      fee: { type: Number },
      cancelledAt: { type: Date },
    },
    handover: {
      ownerPhotos: { type: [photoSchema], default: [] },
      shippedAt: { type: Date },
      renterPhotos: { type: [photoSchema], default: [] },
      receivedAt: { type: Date },
      autoConfirmed: { type: Boolean, default: false },
    },
    rentalStartedAt: { type: Date },
    returnInfo: {
      photos: { type: [photoSchema], default: [] },
      note: { type: String },
      requestedAt: { type: Date },
      lateDays: { type: Number, default: 0 },
      lateFee: { type: Number, default: 0 },
    },
    settlement: {
      result: { type: String, enum: ['GOOD', 'DAMAGED'] },
      evidencePhotos: { type: [photoSchema], default: [] },
      description: { type: String },
      settledAt: { type: Date },
      autoSettled: { type: Boolean, default: false },
      disputeId: { type: Schema.Types.ObjectId, ref: 'Dispute' },
    },
    lastReminderAt: { type: Date },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

rentalOrderSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
rentalOrderSchema.index({ renterId: 1, createdAt: -1 }, { name: 'renter_orders' });
rentalOrderSchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_orders' });
rentalOrderSchema.index({ toyId: 1, status: 1, 'period.startDate': 1 }, { name: 'toy_calendar' });
rentalOrderSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export const RentalOrder: Model<IRentalOrder> =
  (mongoose.models.RentalOrder as Model<IRentalOrder>) ||
  mongoose.model<IRentalOrder>('RentalOrder', rentalOrderSchema);

export default RentalOrder;
