import mongoose, { Schema } from 'mongoose';

const donationRequestSchema = new Schema(
  {
    code: { type: String, required: true },
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

export const DonationRequest =
  mongoose.models.DonationRequest || mongoose.model('DonationRequest', donationRequestSchema);

export default DonationRequest;
