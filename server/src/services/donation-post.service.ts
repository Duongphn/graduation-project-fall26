import mongoose from 'mongoose';

import type { ToyImageStorage } from '../interfaces/toy-listing.ports.js';
import { Category } from '../models/category.model.js';
import { IdentityVerification } from '../models/identity-verification.model.js';
import { Toy } from '../models/toy.model.js';
import { saveWithActiveCategory } from '../repositories/toy-listing.repository.js';
import { AppError } from '../utils/app-error.js';
import { validateToyImage } from '../utils/image-validation.js';
import { objectIdSchema } from '../validations/common.validation.js';
import { handoverMethodSchema } from '../validations/donation-request.validation.js';
import { DONOR_REQUEST_NOTE_MAX } from '../constants/donation-request-transitions.js';
import { assertOrganizationTakesToys } from './donation-request.service.js';
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
// UC33 step 4: the post can name an organization, a handover method and a note to it, checked
// like POST /donation-requests/to-organization; the request to it is created as Pending once the
// Admin approves the post (step 5, donation.subscriptions.ts).

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

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', message, { field });

/** A multipart text field: a trimmed string, empty means not sent. */
const textField = (body: Record<string, unknown>, name: string): string | undefined => {
  const value = body[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

/**
 * UC33 step 4 (R03 III.5.2.1 (5)–(8)): the organization chosen on the form, the handover method
 * its receiving point allows (required with an organization, MSG52) and an optional note of up
 * to 300 characters. Without an organization the post stays open for requests (FE-02, "Keep
 * open for requests"), and a note has nobody to go to.
 */
const parseDonationTarget = (body: Record<string, unknown>) => {
  const organizationId = textField(body, 'organizationId');
  const note = textField(body, 'note');
  if (!organizationId) {
    if (note) throw invalid('organizationId', 'Vui lòng chọn tổ chức nhận trước khi ghi chú.');
    return undefined;
  }
  if (!objectIdSchema.safeParse(organizationId).success) {
    throw invalid('organizationId', 'Mã tổ chức không hợp lệ.');
  }
  const handoverMethod = handoverMethodSchema.safeParse(textField(body, 'handoverMethod'));
  if (!handoverMethod.success) {
    throw invalid('handoverMethod', 'Vui lòng chọn mang đến hoặc gửi qua vận chuyển.');
  }
  if (note && note.length > DONOR_REQUEST_NOTE_MAX) {
    throw invalid('note', `Ghi chú cho tổ chức tối đa ${DONOR_REQUEST_NOTE_MAX} ký tự.`);
  }
  return { organizationId, handoverMethod: handoverMethod.data, ...(note ? { note } : {}) };
};

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
  const target = parseDonationTarget(body);
  if (target) await assertOrganizationTakesToys(target.organizationId, target.handoverMethod);

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
        ...(target
          ? {
              donationTarget: {
                ...target,
                organizationId: new mongoose.Types.ObjectId(target.organizationId),
              },
            }
          : {}),
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
      // UC33 step 5: the request to this organization is created when the Admin approves the post.
      donationTarget: target ?? null,
      createdAt: toy.createdAt,
      updatedAt: toy.updatedAt,
    };
  } catch (error) {
    await cleanUp();
    throw error;
  }
};
