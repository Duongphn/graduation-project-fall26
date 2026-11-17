import mongoose from 'mongoose';

import type { ToyImageStorage } from '../interfaces/toy-listing.ports.js';
import { Category } from '../models/category.model.js';
import { IdentityVerification } from '../models/identity-verification.model.js';
import { Toy } from '../models/toy.model.js';
import { saveWithActiveCategory } from '../repositories/toy-listing.repository.js';
import { AppError } from '../utils/app-error.js';
import { validateToyImage } from '../utils/image-validation.js';
import {
  assertListingTextRules,
  assertNoContactDetails,
  validateCreateToyListingInput,
} from '../validations/toy-listing.validation.js';

// POST /donation-posts: a free donation post. Develop's toy listing service only takes
// rent/sell listings, so donation posts are created here with develop's toys model
// (listingType 'donate', priceOrRate 0) and go through Admin moderation like any listing
// (status 'pending'). Same checks as develop's listing: verified identity, active category,
// JPEG/PNG/WebP images (develop's toyImageUpload middleware). A donation post has 3 to 10 photos
// (R03 GB-10 and III.5.2.1 (2), R04 toys.images). The title and description follow the rent and
// sale rules (R03 III.5.2.1 (1)): title at most 100 characters, description 50 to 1000, and no
// phone number, email address or http/www link (GB-11). Like POST /toys, the toy is saved in the
// transaction that touches its category, so an Admin hide or delete during the upload cannot
// leave the post on that category ("Category rules" in docs/api/toys.md).

const isVerifiedUser = async (userId: string) =>
  (await IdentityVerification.exists({ userId, status: { $regex: /^verified$/i } })) !== null;

const isActiveCategory = async (categoryId: string) =>
  mongoose.Types.ObjectId.isValid(categoryId) &&
  (await Category.exists({ _id: categoryId, status: { $regex: /^active$/i } })) !== null;

/** R03 GB-10: a donation listing has 3 to 10 photos; toyImageUpload already refuses an 11th. */
const MIN_DONATION_IMAGES = 3;
const MAX_DONATION_IMAGES = 10;

const categoryNotAvailable = () =>
  new AppError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive');

export const createDonationPost = async (
  imageStorage: ToyImageStorage,
  userId: string,
  body: Record<string, unknown>,
  files: Express.Multer.File[],
) => {
  if (!(await isVerifiedUser(userId))) {
    throw new AppError(
      403,
      'USER_NOT_VERIFIED',
      'User identity must be verified to create listings',
    );
  }
  // Develop's listing validator parses title, description, condition, categoryId and ageRange;
  // the price fields do not apply to a donation.
  const input = validateCreateToyListingInput({ ...body, listingType: 'sell', priceOrRate: 1 });
  assertListingTextRules(input);
  assertNoContactDetails(input);
  if (!(await isActiveCategory(input.categoryId))) {
    throw categoryNotAvailable();
  }
  if (files.length < MIN_DONATION_IMAGES || files.length > MAX_DONATION_IMAGES) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `A donation post needs ${MIN_DONATION_IMAGES} to ${MAX_DONATION_IMAGES} images.`,
    );
  }
  for (const file of files) validateToyImage(file.buffer, file.mimetype);

  const uploaded: Array<{ url: string; publicId: string }> = [];
  const cleanUp = async () => {
    if (uploaded.length === 0) return;
    await imageStorage.delete(uploaded.map((image) => image.publicId)).catch(() => undefined);
  };
  try {
    for (const file of files) uploaded.push(await imageStorage.upload(file.buffer, file.mimetype));
    // The check above ran before the uploads; the touch write re-checks the category atomically.
    // A new document on every run of the callback, which runs again after a transient commit
    // error.
    const touched = await saveWithActiveCategory(input.categoryId, (session) =>
      new Toy({
        ownerId: new mongoose.Types.ObjectId(userId),
        categoryId: new mongoose.Types.ObjectId(input.categoryId),
        title: input.title,
        description: input.description,
        condition: input.condition,
        listingType: 'donate' as unknown as 'sell',
        priceOrRate: 0,
        status: 'pending',
        moderation: { submittedAt: new Date() },
        ageRange: input.ageRange,
        images: uploaded,
        quantity: 1,
      }).save({ session }),
    );
    if (!touched) throw categoryNotAvailable();
    const toy = touched.result;
    return {
      id: String(toy._id),
      ownerId: userId,
      categoryId: input.categoryId,
      // Like the toy listing responses (docs/api/toys.md "Category rules").
      categoryName: touched.categoryName,
      title: toy.title,
      description: toy.description,
      condition: toy.condition,
      listingType: 'donate' as const,
      priceOrRate: 0,
      ageRange: input.ageRange,
      images: uploaded,
      quantity: 1,
      status: 'pending' as const,
      createdAt: toy.createdAt,
      updatedAt: toy.updatedAt,
    };
  } catch (error) {
    await cleanUp();
    throw error;
  }
};
