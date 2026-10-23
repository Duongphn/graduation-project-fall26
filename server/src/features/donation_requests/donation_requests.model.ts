import mongoose, { type Model, Schema } from 'mongoose';

import type { DonationStatus } from './domain/donation-status.js';

/** Stored value of a donation status: develop's model stores lowercase ('pending' by default). */
export type StoredDonationStatus = Lowercase<DonationStatus>;

// Added for the donor flow (not in develop's original schema): who decided and why, the
// handover photo proofs, completion and cancellation.
const handoverSchema = new Schema(
  {
    step: { type: String, required: true, enum: ['DONOR_SENT', 'RECEIVER_RECEIVED'] },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    photos: { type: [String], default: [] },
    note: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const cancellationSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    actorType: { type: String, required: true, enum: ['USER', 'ADMIN', 'SYSTEM'] },
    reason: { type: String, required: true },
    note: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const donationRequestSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    donorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    receiver: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    },
    itemDetails: { type: String, required: true },
    deliveryMethod: { type: String, required: true },
    status: { type: String, required: true, default: 'pending' },
    timer: {
      dueAt: { type: Date },
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    rejectReason: { type: String },
    handovers: { type: [handoverSchema], default: [] },
    completedAt: { type: Date },
    cancellation: { type: cancellationSchema, default: undefined },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
donationRequestSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
donationRequestSchema.index(
  { toyId: 1, 'receiver.userId': 1, 'receiver.organizationId': 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_per_receiver',
  },
);
donationRequestSchema.index({ toyId: 1, status: 1, createdAt: -1 }, { name: 'toy_requests' });
donationRequestSchema.index({ donorId: 1, status: 1, createdAt: -1 }, { name: 'donor_requests' });
donationRequestSchema.index({ requestedBy: 1, createdAt: -1 }, { name: 'requester_requests' });
donationRequestSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export interface DonationHandover {
  step: 'DONOR_SENT' | 'RECEIVER_RECEIVED';
  by: mongoose.Types.ObjectId;
  photos: string[];
  note?: string;
  at: Date;
}

export interface DonationCancellation {
  by?: mongoose.Types.ObjectId;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  reason: string;
  note?: string;
  at: Date;
}

export interface IDonationRequest {
  _id: mongoose.Types.ObjectId;
  code: string;
  donorId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  toyId: mongoose.Types.ObjectId;
  receiver?: {
    userId?: mongoose.Types.ObjectId;
    organizationId?: mongoose.Types.ObjectId;
  };
  itemDetails: string;
  deliveryMethod: string;
  status: StoredDonationStatus;
  timer?: { dueAt?: Date };
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  rejectReason?: string;
  handovers: DonationHandover[];
  completedAt?: Date;
  cancellation?: DonationCancellation;
  createdAt: Date;
  updatedAt: Date;
}

export const DonationRequest: Model<IDonationRequest> =
  (mongoose.models.DonationRequest as Model<IDonationRequest>) ||
  mongoose.model<IDonationRequest>('DonationRequest', donationRequestSchema);

export default DonationRequest;
