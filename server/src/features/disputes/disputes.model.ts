import { Schema, model, type InferSchemaType } from 'mongoose';

import { money, optionalMoney } from '../../infrastructure/database/schema-types.js';
import { orderTypes } from '../../shared/contracts/order-status-change.js';
import { disputeStatuses, openDisputeStatuses } from '../../shared/domain/statuses.js';

const photos = {
  type: [String],
  validate: {
    validator: (value: string[]) => value.length <= 10,
    message: 'At most 10 photos.',
  },
};

// BF-05. The frozen money stays in the payer's `held` balance until the ruling.
// The service checks that the order exists and caps `frozenAmount` (deposit for a rental,
// price for a purchase, GB-25).
const disputeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    orderType: {
      type: String,
      enum: orderTypes.filter((type) => type !== 'DONATION'),
      required: true,
    },
    orderId: { type: Schema.Types.ObjectId, required: true },
    claimantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    respondentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    evidence: {
      ...photos,
      validate: {
        validator: (value: string[]) => value.length >= 1 && value.length <= 10,
        message: 'A dispute needs 1 to 10 photos.',
      },
    },
    frozenAmount: money(),
    status: { type: String, enum: disputeStatuses, required: true, default: 'OPEN' },
    // The other side has 3 days to reply (FE-08).
    respondBy: { type: Date, required: true },
    response: {
      text: { type: String, trim: true, maxlength: 5000 },
      photos,
      at: { type: Date },
    },
    // GB-26: written once, with a reason, by the conditional update that moves an open
    // dispute to RESOLVED. RESOLVED is final, so the ruling is never edited.
    ruling: {
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: { type: String, trim: true, maxlength: 5000 },
      toClaimant: optionalMoney(),
      toRespondent: optionalMoney(),
      at: { type: Date },
    },
  },
  { collection: 'disputes', timestamps: true },
);

disputeSchema.pre('validate', function checkDispute() {
  if (this.claimantId && this.respondentId && this.claimantId.equals(this.respondentId)) {
    this.invalidate('respondentId', 'The two sides of a dispute must be different users.');
  }

  if (this.status === 'RESOLVED') {
    const ruling = this.ruling;
    if (!ruling?.decidedBy || !ruling.reason || !ruling.at) {
      this.invalidate('ruling', 'A resolved dispute needs a ruling with a reason.');
    } else if ((ruling.toClaimant ?? 0) + (ruling.toRespondent ?? 0) !== this.frozenAmount) {
      this.invalidate('ruling', 'The ruling must share out exactly the frozen amount.');
    }
  }
});

disputeSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
disputeSchema.index(
  { orderType: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...openDisputeStatuses] } },
    name: 'one_open_per_order',
  },
);
disputeSchema.index({ status: 1, createdAt: 1 }, { name: 'admin_queue' });
disputeSchema.index({ claimantId: 1, createdAt: -1 }, { name: 'claimant_disputes' });
disputeSchema.index({ respondentId: 1, createdAt: -1 }, { name: 'respondent_disputes' });
disputeSchema.index(
  { respondBy: 1 },
  { partialFilterExpression: { status: 'OPEN' }, name: 'response_due' },
);

export type Dispute = InferSchemaType<typeof disputeSchema>;
export const DisputeModel = model('Dispute', disputeSchema);
