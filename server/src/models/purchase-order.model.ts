import mongoose, { type Model, Schema, type Types } from 'mongoose';
import { resaleOrderStatuses, type ResaleOrderStatus } from '../constants/resale-order-status.js';

export interface PurchaseDeliveryInfo {
  recipientName: string;
  recipientPhone: string;
  province?: string;
  district?: string;
  ward?: string;
  street?: string;
  notes?: string;
}

export interface PurchasePhoto {
  url: string;
  publicId?: string | undefined;
}

export interface PurchaseShippingInfo {
  carrierName: string;
  trackingCode?: string | undefined;
  photos?: PurchasePhoto[] | undefined;
  shippedAt?: Date | undefined;
  note?: string | undefined;
}

export interface PurchaseSettlement {
  settledAt: Date;
  sellerReceived: number;
  platformFee: number;
  autoSettled?: boolean | undefined;
}

export interface PurchasePricing {
  itemPrice: number;
  shippingFee: number;
  platformFee: number;
  totalPayable: number;
  sellerNet: number;
}

const deliveryInfoSchema = new Schema(
  {
    recipientName: { type: String, default: '' },
    recipientPhone: { type: String, default: '' },
    province: { type: String },
    district: { type: String },
    ward: { type: String },
    street: { type: String },
    notes: { type: String },
  },
  { _id: false },
);

const photoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String },
  },
  { _id: false },
);

const shippingInfoSchema = new Schema(
  {
    carrierName: { type: String, default: '' },
    trackingCode: { type: String, default: '' },
    photos: { type: [photoSchema], default: [] },
    shippedAt: { type: Date },
    note: { type: String },
  },
  { _id: false },
);

const settlementSchema = new Schema(
  {
    settledAt: { type: Date, required: true },
    sellerReceived: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    autoSettled: { type: Boolean, default: false },
  },
  { _id: false },
);

const pricingSchema = new Schema(
  {
    itemPrice: { type: Number, required: true },
    shippingFee: { type: Number, required: true, default: 0 },
    platformFee: { type: Number, required: true, default: 0 },
    totalPayable: { type: Number, required: true },
    sellerNet: { type: Number, required: true },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema(
  {
    code: { type: String, required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    itemDetails: { type: String, required: true },
    price: { type: Number, required: true },
    deliveryMethod: { type: String, required: true, enum: ['DELIVERY', 'LOCAL_PICKUP'] },
    deliveryInfo: { type: deliveryInfoSchema },
    shippingInfo: { type: shippingInfoSchema },
    pricing: { type: pricingSchema },
    status: {
      type: String,
      required: true,
      enum: resaleOrderStatuses,
      default: 'PENDING',
    },
    paidAt: { type: Date },
    shippedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    settlement: { type: settlementSchema },
    timer: {
      dueAt: { type: Date },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
purchaseOrderSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
purchaseOrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 }, { name: 'buyer_orders' });
purchaseOrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 }, { name: 'seller_orders' });
purchaseOrderSchema.index({ toyId: 1, status: 1 }, { name: 'toy_orders' });
purchaseOrderSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export interface IPurchaseOrder {
  _id: Types.ObjectId;
  code: string;
  buyerId: Types.ObjectId;
  sellerId: Types.ObjectId;
  toyId: Types.ObjectId;
  itemDetails: string;
  price: number;
  deliveryMethod: string;
  deliveryInfo?: PurchaseDeliveryInfo;
  shippingInfo?: PurchaseShippingInfo;
  pricing?: PurchasePricing;
  status: ResaleOrderStatus;
  paidAt?: Date;
  shippedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  settlement?: PurchaseSettlement | undefined;
  timer?: {
    dueAt?: Date | undefined;
  } | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export const PurchaseOrder: Model<IPurchaseOrder> =
  (mongoose.models.PurchaseOrder as Model<IPurchaseOrder>) ||
  mongoose.model<IPurchaseOrder>('PurchaseOrder', purchaseOrderSchema);

export default PurchaseOrder;
