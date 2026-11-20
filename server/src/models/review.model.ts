import mongoose, { type Model, Schema, type Types } from 'mongoose';

export type ReviewDirection = 'RENTER_TO_OWNER' | 'OWNER_TO_RENTER';
export type TrustDecision = 'ALLOW' | 'KEEP_RESTRICTED';

export interface IReview {
  _id: Types.ObjectId;
  orderType: 'rental_order';
  orderId: Types.ObjectId;
  direction: ReviewDirection;
  reviewerId: Types.ObjectId;
  revieweeId: Types.ObjectId;
  toyId: Types.ObjectId;
  userRating: number;
  toyRating?: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ratingField = {
  type: Number,
  min: 1,
  max: 5,
  validate: { validator: Number.isInteger, message: 'Điểm đánh giá phải là số nguyên từ 1 đến 5' },
};

const reviewSchema = new Schema<IReview>(
  {
    orderType: { type: String, required: true, enum: ['rental_order'] },
    orderId: { type: Schema.Types.ObjectId, required: true },
    direction: { type: String, required: true, enum: ['RENTER_TO_OWNER', 'OWNER_TO_RENTER'] },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    userRating: { ...ratingField, required: true },
    toyRating: { ...ratingField },
    comment: { type: String, maxlength: 1000 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

reviewSchema.index(
  { orderType: 1, orderId: 1, reviewerId: 1 },
  { unique: true, name: 'review_once_per_order' },
);
reviewSchema.index({ revieweeId: 1, createdAt: -1 }, { name: 'reviewee_reviews' });
reviewSchema.index({ toyId: 1, direction: 1, createdAt: -1 }, { name: 'toy_reviews' });

export const Review: Model<IReview> =
  (mongoose.models.Review as Model<IReview>) || mongoose.model<IReview>('Review', reviewSchema);

export default Review;
