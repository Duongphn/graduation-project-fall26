import { Schema, model, type InferSchemaType } from 'mongoose';

import { optionalMoney } from '../../infrastructure/database/schema-types.js';
import { ageGroups, listingTypes, toyConditions } from '../../shared/domain/enums.js';
import { toyStatuses } from '../../shared/domain/statuses.js';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) =>
          value.length === 2 &&
          Math.abs(value[0] ?? Number.NaN) <= 180 &&
          Math.abs(value[1] ?? Number.NaN) <= 90,
        message: 'Coordinates must be [longitude, latitude].',
      },
    },
  },
  { _id: false },
);

const toySchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    images: {
      type: [String],
      validate: {
        validator: (images: string[]) => images.length >= 1 && images.length <= 10,
        message: 'A toy post needs 1 to 10 photos.',
      },
    },
    // Cloudinary public_id of each photo, same order as images (set by the toy listing
    // upload flow, used to delete replaced or removed photos).
    imagePublicIds: {
      type: [String],
      default: undefined,
    },
    condition: { type: String, enum: toyConditions, required: true },
    ageGroup: { type: String, enum: ageGroups, required: true },
    // Exact age range chosen in the listing form (years); ageGroup is derived from minAge.
    ageRange: {
      type: new Schema(
        {
          minAge: { type: Number, required: true, min: 0 },
          maxAge: { type: Number, required: true, min: 0 },
        },
        { _id: false },
      ),
      default: undefined,
    },
    listingType: { type: String, enum: listingTypes, required: true },
    // RENT: rentPerDay + deposit. SALE: salePrice. DONATION: no price.
    pricing: {
      rentPerDay: optionalMoney(),
      deposit: optionalMoney(),
      salePrice: optionalMoney(),
    },
    status: { type: String, enum: toyStatuses, required: true, default: 'PENDING_REVIEW' },
    // Area shown to users and used by the area filter, e.g. "Cau Giay, Ha Noi".
    // Optional until the listing form collects it (the UC04 listing flow does not send it yet).
    area: { type: String, trim: true, maxlength: 200 },
    location: { type: pointSchema, default: undefined },
    moderation: {
      submittedAt: { type: Date },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      rejectReason: { type: String, trim: true, maxlength: 500 },
    },
    // Incremented inside the accept-rental transaction to serialise concurrent bookings.
    calendarVersion: { type: Number, required: true, default: 0 },
  },
  { collection: 'toys', timestamps: true },
);

toySchema.pre('validate', function checkImagePublicIds() {
  if (this.imagePublicIds && this.imagePublicIds.length !== this.images.length) {
    this.invalidate('imagePublicIds', 'imagePublicIds must match images one to one.');
  }
  const range = this.ageRange;
  if (range && range.minAge > range.maxAge) {
    this.invalidate('ageRange', 'minAge must not be greater than maxAge.');
  }
});

toySchema.pre('validate', function checkPricing() {
  const { rentPerDay, deposit, salePrice } = this.pricing ?? {};
  const has = (value: number | null | undefined): boolean => value !== undefined && value !== null;

  if (this.listingType === 'RENT') {
    if (!has(rentPerDay) || !has(deposit)) {
      this.invalidate('pricing', 'A rental post needs a price per day and a deposit.');
    }
    if (has(salePrice)) {
      this.invalidate('pricing.salePrice', 'A rental post has no sale price.');
    }
  }

  if (this.listingType === 'SALE') {
    if (!has(salePrice)) {
      this.invalidate('pricing.salePrice', 'A sale post needs a price.');
    }
    if (has(rentPerDay) || has(deposit)) {
      this.invalidate('pricing', 'A sale post has no rental price or deposit.');
    }
  }

  if (this.listingType === 'DONATION' && (has(rentPerDay) || has(deposit) || has(salePrice))) {
    this.invalidate('pricing', 'A donation post has no price (FE-02).');
  }
});

toySchema.index({ status: 1, categoryId: 1, createdAt: -1 }, { name: 'browse_by_category' });
toySchema.index({ status: 1, listingType: 1, createdAt: -1 }, { name: 'browse_by_type' });
toySchema.index({ status: 1, ageGroup: 1, createdAt: -1 }, { name: 'browse_by_age' });
toySchema.index({ location: '2dsphere', status: 1, listingType: 1 }, { name: 'near_me' });
toySchema.index({ title: 'text', description: 'text' }, { name: 'keyword_search' });
toySchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_toys' });
toySchema.index(
  { 'moderation.submittedAt': 1 },
  { partialFilterExpression: { status: 'PENDING_REVIEW' }, name: 'moderation_queue' },
);

export type Toy = InferSchemaType<typeof toySchema>;
export const ToyModel = model('Toy', toySchema);

/** Shape used by the toy listing service (UC04). */
export type IToy = Toy;
