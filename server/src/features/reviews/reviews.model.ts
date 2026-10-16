import { Schema, model, type InferSchemaType } from 'mongoose';

import { orderTypes } from '../../shared/contracts/order-status-change.js';

// FE-09: after a completed order, each side rates the other once (GB-28).
// The service checks that the order is COMPLETED, that the reviewer is a party and the
// reviewee the other party, and updates `users.trust` in the same transaction.
const reviewSchema = new Schema(
  {
    orderType: {
      type: String,
      enum: orderTypes.filter((type) => type !== 'DONATION'),
      required: true,
    },
    orderId: { type: Schema.Types.ObjectId, required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'A rating is a whole number of stars.' },
    },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { collection: 'reviews', timestamps: true },
);

reviewSchema.pre('validate', function checkParties() {
  if (this.reviewerId && this.revieweeId && this.reviewerId.equals(this.revieweeId)) {
    this.invalidate('revieweeId', 'Users cannot review themselves.');
  }
});

reviewSchema.index(
  { orderId: 1, reviewerId: 1 },
  { unique: true, name: 'one_per_order_and_reviewer' },
);
reviewSchema.index({ revieweeId: 1, createdAt: -1 }, { name: 'user_reviews' });

export type Review = InferSchemaType<typeof reviewSchema>;
export const ReviewModel = model('Review', reviewSchema);
