import { Schema, model, type InferSchemaType } from 'mongoose';

import { cancellationSchema, handoverSchema } from '../../infrastructure/database/schema-types.js';
import { donationReceiverTypes } from '../../shared/domain/enums.js';
import { activeDonationStatuses, donationStatuses } from '../../shared/domain/statuses.js';

// FE-02 / BF-04: a request on a posted DONATION toy. The toy carries the condition, photos
// and age group. No fee, no deposit, no wallet entries.
// Receiver: a user (receiverType USER, requestedBy is the receiver) or an organization
// (receiverType ORGANIZATION + organizationId; requestedBy is the Admin who filed it, while
// the requester side is the Admin team: notifications go to every active Admin and the
// requester actions use the /admin routes). The Donor or an Admin accepts or rejects.
const donationRequestSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    donorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The user who sends the request: the receiver, or the person acting for the organization.
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverType: { type: String, enum: donationReceiverTypes, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    message: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: donationStatuses, required: true, default: 'PENDING' },
    // Accepted or rejected by the Donor or an Admin.
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    rejectReason: { type: String, trim: true, maxlength: 500 },
    handovers: { type: [handoverSchema], default: [] },
    completedAt: { type: Date },
    cancellation: { type: cancellationSchema, default: undefined },
  },
  { collection: 'donation_requests', timestamps: true },
);

donationRequestSchema.pre('validate', function checkReceiver() {
  if (this.receiverType === 'ORGANIZATION' && !this.organizationId) {
    this.invalidate('organizationId', 'A donation to an organization needs the organization.');
  }
  if (this.receiverType === 'USER' && this.organizationId) {
    this.invalidate('organizationId', 'A donation to a user has no organization.');
  }
  if (this.donorId && this.requestedBy && this.donorId.equals(this.requestedBy)) {
    this.invalidate('requestedBy', 'A donor cannot request their own toy.');
  }
});

donationRequestSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
// One PENDING request per toy and requester. organizationId is part of the key, so an Admin
// may file PENDING requests for several organizations on the same toy (it is absent, so equal,
// for USER requests); one_pending_per_organization keeps one per organization.
donationRequestSchema.index(
  { toyId: 1, requestedBy: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
    name: 'one_pending_per_requester',
  },
);
donationRequestSchema.index(
  { toyId: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING', receiverType: 'ORGANIZATION' },
    name: 'one_pending_per_organization',
  },
);
// Donate once: at most one accepted request per toy.
donationRequestSchema.index(
  { toyId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...activeDonationStatuses] } },
    name: 'one_accepted_per_toy',
  },
);
donationRequestSchema.index({ toyId: 1, status: 1, createdAt: -1 }, { name: 'toy_requests' });
donationRequestSchema.index({ donorId: 1, status: 1, createdAt: -1 }, { name: 'donor_requests' });
donationRequestSchema.index({ requestedBy: 1, createdAt: -1 }, { name: 'requester_requests' });
// Requests of one organization (admin list counts, "hidden while requests are open").
donationRequestSchema.index(
  { organizationId: 1, status: 1, createdAt: -1 },
  {
    partialFilterExpression: { receiverType: 'ORGANIZATION' },
    name: 'organization_requests',
  },
);

export type DonationRequest = InferSchemaType<typeof donationRequestSchema>;
export const DonationRequestModel = model('DonationRequest', donationRequestSchema);
