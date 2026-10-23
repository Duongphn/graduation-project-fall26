import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type {
  ListingType,
  StoredListingStatus,
  ToyAgeRange,
  ToyImage,
  ToyLocation,
  ToyModeration,
} from './toy-listing.ports.js';

export interface IToy {
  ownerId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  condition: string;
  listingType: ListingType;
  priceOrRate: number;
  depositPrice?: number | undefined;
  status: StoredListingStatus;
  location?: ToyLocation | undefined;
  moderation?: ToyModeration | undefined;
  ageRange: ToyAgeRange;
  images: ToyImage[];
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ToyDocument = Document<mongoose.Types.ObjectId> & IToy;

const pointSchema = new Schema(
  {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number] },
  },
  { _id: false },
);

export const toySchema = new Schema<IToy>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    condition: { type: String, required: true },
    // 'donate': free donation posts (donor flow); develop's listing service handles rent/sell.
    listingType: { type: String, required: true, enum: ['rent', 'sell', 'donate'] },
    priceOrRate: { type: Number, required: true },
    depositPrice: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'active', 'hidden'],
      default: 'pending',
    },
    location: {
      type: pointSchema,
      required: false,
      default: undefined,
    },
    moderation: {
      submittedAt: { type: Date },
      // Set by the Admin toy moderation (approve / reject).
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      rejectReason: { type: String },
    },
    ageRange: {
      minAge: { type: Number, required: true },
      maxAge: { type: Number, required: true },
    },
    images: [
      {
        _id: false,
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    quantity: { type: Number, required: true, default: 1 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
toySchema.index({ status: 1, categoryId: 1, createdAt: -1 }, { name: 'browse_by_category' });
toySchema.index({ status: 1, listingType: 1, createdAt: -1 }, { name: 'browse_by_type' });
toySchema.index({ location: '2dsphere', status: 1, listingType: 1 }, { name: 'near_me' });
toySchema.index({ title: 'text', description: 'text' }, { name: 'keyword_search' });
toySchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_toys' });
toySchema.index(
  { 'moderation.submittedAt': 1 },
  {
    partialFilterExpression: { 'moderation.submittedAt': { $exists: true } },
    name: 'moderation_queue',
  },
);

export const Toy: Model<IToy> =
  (mongoose.models.Toy as Model<IToy>) || mongoose.model<IToy>('Toy', toySchema);

export default Toy;
