import mongoose from 'mongoose';

import type { ToyImageStorage } from '../interfaces/toy-listing.ports.js';
import { Category } from '../models/category.model.js';
import { IdentityVerification } from '../models/identity-verification.model.js';
import { Toy } from '../models/toy.model.js';
import { AppError } from '../utils/app-error.js';
import { validateToyImage } from '../utils/image-validation.js';
import { validateCreateToyListingInput } from '../validations/toy-listing.validation.js';

// POST /donation-posts: a free donation post. Develop's toy listing service only takes
// rent/sell listings, so donation posts are created here with develop's toys model
// (listingType 'donate', priceOrRate 0) and go through Admin moderation like any listing
// (status 'pending'). Same checks as develop's listing: verified identity, active category,
// 1-10 images (JPEG/PNG/WebP, develop's toyImageUpload middleware).

const isVerifiedUser = async (userId: string) =>
  (await IdentityVerification.exists({ userId, status: { $regex: /^verified$/i } })) !== null;

const isActiveCategory = async (categoryId: string) =>
  mongoose.Types.ObjectId.isValid(categoryId) &&
  (await Category.exists({ _id: categoryId, status: { $regex: /^active$/i } })) !== null;

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
  if (!(await isActiveCategory(input.categoryId))) {
    throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive');
  }
  if (files.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one image is required.');
  }
  for (const file of files) validateToyImage(file.buffer, file.mimetype);

  const uploaded: Array<{ url: string; publicId: string }> = [];
  const cleanUp = async () => {
    if (uploaded.length === 0) return;
    await imageStorage.delete(uploaded.map((image) => image.publicId)).catch(() => undefined);
  };
  try {
    for (const file of files) uploaded.push(await imageStorage.upload(file.buffer, file.mimetype));
    const toy = await Toy.create({
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
    });
    return {
      id: String(toy._id),
      ownerId: userId,
      categoryId: input.categoryId,
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
