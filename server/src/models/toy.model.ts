import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type {
  ListingType,
  StoredListingStatus,
  ToyAgeRange,
  ToyImage,
  ToyLocation,
  ToyModeration,
} from '../interfaces/toy-listing.ports.js';

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
  /** When the Owner last declared the toy safe (UC05): on create and on every edit. */
  safetyDeclaredAt?: Date | undefined;
  bookingVersion: number;
  // UC33: a new donation post sent to an organization (donation flow only).
  donationTarget?: ToyDonationTarget | undefined;
  rating?: { sum: number; count: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface ToyDonationTarget {
  organizationId: mongoose.Types.ObjectId;
  handoverMethod: 'drop_off' | 'carrier';
  // R03 III.5.2.1 (8): the Donor's note to the organization, at most 300 characters.
  note?: string | undefined;
}

export type ToyDocument = Document<mongoose.Types.ObjectId> & IToy;

const pointSchema = new Schema(
  {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number] },
  },
  { _id: false },
);

const safetyChecklistSchema = new Schema(
  {
    photosShowWholeToy: { type: Boolean, required: true },
    ageFitsSmallParts: { type: Boolean, required: true },
    batteryCompartmentSecured: { type: Boolean, required: true },
    notRecalledOrBanned: { type: Boolean, required: true },
    noHiddenDefect: { type: Boolean, required: true },
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
      // Admin safety checklist ticked on approval (UC27, GB-48); written by toy-moderation.
      safetyChecklist: { type: safetyChecklistSchema, default: undefined },
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
    // Not required: older listings and donation posts have none (UC05).
    safetyDeclaredAt: { type: Date },
    bookingVersion: { type: Number, required: true, default: 0 },
    // UC33 step 5 (donation flow): the organization and handover method chosen on a new donation
    // post. The donation request is created when the Admin approves the post, which clears it.
    donationTarget: {
      type: new Schema(
        {
          organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
          handoverMethod: { type: String, required: true, enum: ['drop_off', 'carrier'] },
          note: { type: String },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // Tổng và số lượt điểm đồ chơi người thuê chấm; trung bình = sum / count
    rating: {
      sum: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
toySchema.index({ status: 1, categoryId: 1, createdAt: -1 }, { name: 'browse_by_category' });
toySchema.index({ status: 1, listingType: 1, createdAt: -1 }, { name: 'browse_by_type' });
toySchema.index({ location: '2dsphere', status: 1, listingType: 1 }, { name: 'near_me' });
toySchema.index({ title: 'text', description: 'text' }, { name: 'keyword_search' });
toySchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_toys' });
// Toys of a category in every status: the Admin category list counts them and a category in use
// cannot be deleted (R04 IV 2.2).
toySchema.index({ categoryId: 1 }, { name: 'by_category_id' });
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
