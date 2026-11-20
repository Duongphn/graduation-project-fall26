import 'multer';
import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import type { ToyImageStorage } from '../interfaces/toy-listing.ports.js';
import { validateToyImage } from '../utils/image-validation.js';
import { Toy, type IToy } from '../models/toy.model.js';
import type {
  ListingFilterStatus,
  OwnerModerationView,
  ToyImage,
  ToyListingDto,
  ToyListingPorts,
  ToyModeration,
} from '../interfaces/toy-listing.ports.js';
import {
  assertListingFieldRules,
  assertListingPhotoCount,
  assertNoContactDetails,
  assertSafetyDeclared,
  type CreateToyListingInput,
  type UpdateToyListingInput,
  validateCreateToyListingInput,
  validateUpdateToyListingInput,
} from '../validations/toy-listing.validation.js';

const categoryNotAvailable = () =>
  new AppError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive');

// Another save changed the toy after this request read it; the edit was computed from that read.
const listingChanged = () =>
  new AppError(
    409,
    'LISTING_CHANGED',
    'The listing was changed in the meantime. Reload it and try again.',
  );

// The Owner's view of the review: the reviewing Admin's id (reviewedBy) is left out. A reason is
// stored only while the listing is rejected: approving or sending it again removes it.
const toOwnerModerationView = (moderation: ToyModeration): OwnerModerationView => ({
  ...(moderation.submittedAt ? { submittedAt: moderation.submittedAt } : {}),
  ...(moderation.reviewedAt ? { reviewedAt: moderation.reviewedAt } : {}),
  ...(moderation.rejectReason ? { rejectReason: moderation.rejectReason } : {}),
});

// The toys model also stores donation posts (listingType 'donate', POST /donation-posts), which
// the ListingType of this service does not name.
const isDonationPost = (toy: Pick<IToy, 'listingType'>): boolean =>
  (toy.listingType as string) === 'donate';

/**
 * Whether an edit sends the listing back to Pending Review (GB-08): an approved (active) listing,
 * a rejected one (hidden with the Admin's reason) and a pending one. A listing hidden by its Owner
 * stays hidden.
 */
const isBackToReview = (toy: Pick<IToy, 'status' | 'moderation'>): boolean =>
  toy.status !== 'hidden' || Boolean(toy.moderation?.rejectReason);

/**
 * Whether the Owner edited the listing after the Admin's last review: every edit that waits for a
 * review, and an edit while the Owner hid the listing, stamps `moderation.submittedAt` (GB-08).
 */
const editedSinceReview = (toy: Pick<IToy, 'moderation'>): boolean => {
  const { submittedAt, reviewedAt } = toy.moderation ?? {};
  return !reviewedAt || (submittedAt !== undefined && submittedAt > reviewedAt);
};

/**
 * Whether the Admin has approved the listing (GB-09): it is active, or its last review approved it
 * (an approved listing that was edited is pending, or hidden by its Owner, with that review kept).
 * A rejection, and a rejected listing sent again, leave no approval.
 */
const wasApproved = (toy: Pick<IToy, 'status' | 'moderation'>): boolean =>
  toy.status === 'active' ||
  (Boolean(toy.moderation?.reviewedAt) && !toy.moderation?.rejectReason);

export class ToyListingService {
  public constructor(
    private readonly ports: ToyListingPorts,
    private readonly imageStorage: ToyImageStorage,
    private readonly toyModel: Model<IToy> = Toy,
  ) {}

  private assertActor(actor: RequestActor): void {
    if (!actor || !actor.userId || !mongoose.Types.ObjectId.isValid(actor.userId)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
    // Policy: toy listings belong to member accounts; an Admin account may not own or edit them.
    if (actor.actorType !== 'USER') {
      throw new AppError(403, 'FORBIDDEN', 'Admin accounts cannot manage toy listings.');
    }
  }

  private mapToDto(
    doc: IToy & { _id: mongoose.Types.ObjectId | string },
    derivedStatus: ListingFilterStatus,
    categoryNames: Map<string, string>,
  ): ToyListingDto {
    const categoryId = doc.categoryId.toString();
    return {
      id: doc._id.toString(),
      ownerId: doc.ownerId.toString(),
      categoryId,
      categoryName: categoryNames.get(categoryId) ?? '',
      title: doc.title,
      description: doc.description,
      condition: doc.condition,
      listingType: doc.listingType,
      priceOrRate: doc.priceOrRate,
      ...(doc.listingType === 'rent' && doc.depositPrice !== undefined
        ? { depositPrice: doc.depositPrice }
        : {}),
      ageRange: {
        minAge: doc.ageRange.minAge,
        maxAge: doc.ageRange.maxAge,
      },
      images: (doc.images || []).map((img) => ({
        url: img.url,
        publicId: img.publicId,
      })),
      quantity: doc.quantity ?? 1,
      status: derivedStatus,
      ...(doc.location ? { location: doc.location } : {}),
      ...(doc.moderation ? { moderation: toOwnerModerationView(doc.moderation) } : {}),
      ...(doc.safetyDeclaredAt ? { safetyDeclaredAt: doc.safetyDeclaredAt } : {}),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async create(
    actor: RequestActor,
    input: CreateToyListingInput,
    files: Express.Multer.File[],
  ): Promise<ToyListingDto> {
    this.assertActor(actor);

    const isVerified = await this.ports.isVerifiedUser(actor.userId);
    if (!isVerified) {
      throw new AppError(
        403,
        'USER_NOT_VERIFIED',
        'User identity must be verified to create listings',
      );
    }

    const validatedInput = validateCreateToyListingInput(input);
    assertListingFieldRules(validatedInput);
    assertNoContactDetails(validatedInput);
    assertSafetyDeclared(validatedInput.listingType, validatedInput.safetyDeclaration);

    const categoryExists = await this.ports.categoryExists(validatedInput.categoryId);
    if (!categoryExists) {
      throw categoryNotAvailable();
    }

    assertListingPhotoCount(validatedInput.listingType, files?.length ?? 0);
    for (const file of files) {
      validateToyImage(file.buffer, file.mimetype);
    }

    const uploadedAssets: ToyImage[] = [];
    try {
      for (const file of files) {
        const asset = await this.imageStorage.upload(file.buffer, file.mimetype);
        uploadedAssets.push(asset);
      }
    } catch (uploadError) {
      if (uploadedAssets.length > 0) {
        try {
          await this.imageStorage.delete(uploadedAssets.map((a) => a.publicId));
        } catch {
          // Suppress cleanup error to rethrow initial upload error
        }
      }
      throw uploadError;
    }

    try {
      // The check above ran before the uploads; the touch write re-checks the category atomically.
      // A new document on every run of the callback: withTransaction runs it again when the commit
      // fails with a transient error, and a document saved by an earlier run inserts nothing.
      const touched = await this.ports.saveWithActiveCategory(
        validatedInput.categoryId,
        (session) =>
          new this.toyModel({
            ownerId: new mongoose.Types.ObjectId(actor.userId),
            categoryId: new mongoose.Types.ObjectId(validatedInput.categoryId),
            title: validatedInput.title,
            description: validatedInput.description,
            condition: validatedInput.condition,
            listingType: validatedInput.listingType,
            priceOrRate: validatedInput.priceOrRate,
            ...(validatedInput.listingType === 'rent' && validatedInput.depositPrice !== undefined
              ? { depositPrice: validatedInput.depositPrice }
              : {}),
            status: 'pending',
            // Oldest submission first in the Admin queue (UC27).
            moderation: { submittedAt: new Date() },
            ageRange: validatedInput.ageRange,
            images: uploadedAssets,
            quantity: 1,
            safetyDeclaredAt: new Date(),
          }).save({ session }),
      );
      if (!touched) {
        throw categoryNotAvailable();
      }
      const saved = touched.result;
      return this.mapToDto(
        saved,
        'pending',
        new Map([[saved.categoryId.toString(), touched.categoryName]]),
      );
    } catch (dbError) {
      if (uploadedAssets.length > 0) {
        try {
          await this.imageStorage.delete(uploadedAssets.map((a) => a.publicId));
        } catch {
          // Suppress compensation deletion failure
        }
      }
      throw dbError;
    }
  }

  public async listMine(
    actor: RequestActor,
    query: { status?: ListingFilterStatus; page: number; limit: number },
  ): Promise<{ items: ToyListingDto[]; page: number; limit: number; total: number }> {
    this.assertActor(actor);

    const rawPage = query?.page !== undefined ? Number(query.page) : 1;
    const rawLimit = query?.limit !== undefined ? Number(query.limit) : 20;
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(100, Math.floor(rawLimit)) : 20;

    if (query?.status && !['pending', 'active', 'hidden', 'sold'].includes(query.status)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid status filter "${query.status}".`);
    }

    const ownerObjectId = mongoose.Types.ObjectId.isValid(actor.userId)
      ? new mongoose.Types.ObjectId(actor.userId)
      : actor.userId;

    const candidateToys = await this.toyModel
      .find({ ownerId: ownerObjectId })
      .sort({ createdAt: -1 });

    const candidateIds = candidateToys.map((toy) => toy._id.toString());
    const soldToyIds = await this.ports.getSoldToyIds(candidateIds);

    const matchedToys: {
      toy: IToy & { _id: mongoose.Types.ObjectId };
      derivedStatus: ListingFilterStatus;
    }[] = [];

    for (const toy of candidateToys) {
      const toyIdStr = toy._id.toString();
      const derivedStatus: ListingFilterStatus = soldToyIds.has(toyIdStr) ? 'sold' : toy.status;
      if (!query?.status || derivedStatus === query.status) {
        matchedToys.push({
          toy: toy as IToy & { _id: mongoose.Types.ObjectId },
          derivedStatus,
        });
      }
    }

    const total = matchedToys.length;
    const startIndex = (page - 1) * limit;
    const paginated = matchedToys.slice(startIndex, startIndex + limit);
    const categoryNames = await this.ports.getCategoryNames([
      ...new Set(paginated.map(({ toy }) => toy.categoryId.toString())),
    ]);
    const items = paginated.map(({ toy, derivedStatus }) =>
      this.mapToDto(toy, derivedStatus, categoryNames),
    );

    return { items, page, limit, total };
  }

  public async update(
    actor: RequestActor,
    toyId: string,
    input: UpdateToyListingInput,
    files: Express.Multer.File[] = [],
    removeImagePublicIds: string[] = [],
  ): Promise<ToyListingDto> {
    this.assertActor(actor);

    if (!toyId || !mongoose.Types.ObjectId.isValid(toyId)) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    const listing = await this.toyModel.findById(toyId);
    if (!listing) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    if (listing.ownerId.toString() !== actor.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not own this listing');
    }

    // Check before any upload so a blocked edit never leaves orphaned Cloudinary assets.
    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot edit listing with unfinished orders');
    }

    const validatedInput = validateUpdateToyListingInput(input);
    // GB-11 applies to every post, donation posts included.
    assertNoContactDetails(validatedInput);

    // Only a new category must be active: a toy keeps a category an Admin hid later (RQ-02).
    const newCategoryId = validatedInput.categoryId;
    const categoryChanged =
      newCategoryId !== undefined &&
      !new mongoose.Types.ObjectId(newCategoryId).equals(listing.categoryId);
    if (categoryChanged) {
      const categoryExists = await this.ports.categoryExists(newCategoryId);
      if (!categoryExists) {
        throw categoryNotAvailable();
      }
    }

    // GB-09: the listing type decides the payment and deposit rules, so it is fixed once the
    // Admin has approved the listing; a donation post never becomes a rent or sale listing.
    if (
      validatedInput.listingType !== undefined &&
      validatedInput.listingType !== listing.listingType &&
      (isDonationPost(listing) || wasApproved(listing))
    ) {
      throw new AppError(
        400,
        'LISTING_TYPE_LOCKED',
        isDonationPost(listing)
          ? 'A donation post cannot become a rent or sale listing.'
          : 'The listing type cannot be changed after the listing is approved.',
      );
    }

    const effectiveListingType = validatedInput.listingType ?? listing.listingType;
    // UC05: every edit of a rent or sale listing goes back to review, so the Owner declares the
    // toy safe again; checked before any upload.
    assertSafetyDeclared(
      isDonationPost(listing) ? 'donate' : effectiveListingType,
      validatedInput.safetyDeclaration,
    );
    if (effectiveListingType === 'sell') {
      if (validatedInput.depositPrice !== undefined) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'depositPrice is not allowed for sell listings.',
        );
      }
    } else if (effectiveListingType === 'rent') {
      const effectiveDeposit =
        validatedInput.depositPrice !== undefined
          ? validatedInput.depositPrice
          : listing.depositPrice;
      if (effectiveDeposit === undefined || effectiveDeposit < 0) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'depositPrice must be non-negative for rent listings.',
        );
      }
    }

    // Field rules on what the edit sends; prices against the stored ones they depend on.
    const pricesChanged =
      validatedInput.priceOrRate !== undefined ||
      validatedInput.depositPrice !== undefined ||
      validatedInput.listingType !== undefined;
    if (!isDonationPost(listing)) {
      assertListingFieldRules({
        title: validatedInput.title,
        description: validatedInput.description,
        listingType: effectiveListingType,
        ...(pricesChanged
          ? {
              priceOrRate: validatedInput.priceOrRate ?? listing.priceOrRate,
              depositPrice:
                effectiveListingType === 'rent'
                  ? (validatedInput.depositPrice ?? listing.depositPrice)
                  : undefined,
            }
          : {}),
      });
    }

    const existingImages = listing.images || [];
    const removeSet = new Set(removeImagePublicIds ?? []);
    const remainingImages = existingImages.filter((img) => !removeSet.has(img.publicId));
    const toDelete = existingImages
      .filter((img) => removeSet.has(img.publicId))
      .map((img) => img.publicId);
    const newFiles = files ?? [];
    const finalImageCount = remainingImages.length + newFiles.length;

    assertListingPhotoCount(
      isDonationPost(listing) ? 'donate' : effectiveListingType,
      finalImageCount,
    );
    for (const file of newFiles) {
      validateToyImage(file.buffer, file.mimetype);
    }

    const newUploadedAssets: ToyImage[] = [];
    try {
      for (const file of newFiles) {
        const asset = await this.imageStorage.upload(file.buffer, file.mimetype);
        newUploadedAssets.push(asset);
      }
    } catch (uploadError) {
      if (newUploadedAssets.length > 0) {
        try {
          await this.imageStorage.delete(newUploadedAssets.map((a) => a.publicId));
        } catch {
          // Suppress
        }
      }
      throw uploadError;
    }

    // GB-60: a donation post hidden because the Admin cancelled its Shipping request stays hidden
    // until the Donor edits (or deletes) it; the edit sends it back to review.
    const donationBackToReview =
      isDonationPost(listing) &&
      listing.status === 'hidden' &&
      !listing.moderation?.rejectReason &&
      (await this.ports.hasCancelledShipment?.(toyId, listing.moderation?.reviewedAt)) === true;

    const submittedAt = new Date();
    const applyEdit = (toy: HydratedDocument<IToy>): void => {
      if (validatedInput.title !== undefined) toy.title = validatedInput.title;
      if (validatedInput.description !== undefined) toy.description = validatedInput.description;
      if (validatedInput.condition !== undefined) toy.condition = validatedInput.condition;
      if (categoryChanged) {
        toy.categoryId = new mongoose.Types.ObjectId(newCategoryId);
      }
      if (validatedInput.ageRange !== undefined) toy.ageRange = validatedInput.ageRange;
      if (validatedInput.listingType !== undefined) toy.listingType = validatedInput.listingType;
      if (validatedInput.priceOrRate !== undefined) toy.priceOrRate = validatedInput.priceOrRate;

      if (effectiveListingType === 'rent') {
        if (validatedInput.depositPrice !== undefined) {
          toy.depositPrice = validatedInput.depositPrice;
        }
      } else {
        toy.depositPrice = undefined;
      }

      toy.images = [...remainingImages, ...newUploadedAssets];
      if (!isDonationPost(toy)) toy.safetyDeclaredAt = submittedAt;

      // GB-08: an edited listing waits for the Admin again, also a rejected one sent again
      // (BF-02 1a, BF-03 1a). A listing its Owner hid stays hidden, and donation posts keep the
      // status the donation flow gave them, except the GB-60 case above.
      if (isDonationPost(toy) ? donationBackToReview : isBackToReview(toy)) {
        toy.moderation ??= {};
        if (toy.moderation.rejectReason) {
          // A rejected listing sent again is a new submission: the rejection no longer applies.
          // An approved one keeps its review data, which GB-09 reads.
          toy.moderation.rejectReason = undefined;
          toy.moderation.reviewedAt = undefined;
          toy.moderation.reviewedBy = undefined;
        }
        // A pending listing keeps its place in the queue; any other one is sent again now.
        if (toy.status !== 'pending' || !toy.moderation.submittedAt) {
          toy.moderation.submittedAt = submittedAt;
        }
        toy.status = 'pending';
      } else if (!isDonationPost(toy) && toy.status === 'hidden') {
        // GB-08: edited while its Owner hid it. It stays hidden, and showing it again sends it
        // back to Pending Review, as the Admin has not seen this version.
        toy.moderation ??= {};
        toy.moderation.submittedAt = submittedAt;
      }
    };

    let saved: typeof listing;
    // Set when the category changed: the touch write already returned the new category's name.
    let touchedCategoryName: string | undefined;
    try {
      if (categoryChanged) {
        const touched = await this.ports.saveWithActiveCategory(newCategoryId, async (session) => {
          // Re-read and edit the toy on every run of the callback: withTransaction runs it again
          // when the commit fails with a transient error, and a document saved by an earlier run
          // has no change left to write.
          const toy = await this.toyModel.findById(toyId, null, { session });
          if (!toy) {
            throw new AppError(404, 'NOT_FOUND', 'Listing not found');
          }
          // The edit, its images in particular, was computed from `listing`: refuse it when another
          // save changed the toy since (every images change bumps __v), as the version check of
          // `listing.save()` does on the other path.
          if (toy.__v !== listing.__v) {
            throw listingChanged();
          }
          applyEdit(toy);
          return toy.save({ session });
        });
        if (!touched) {
          throw categoryNotAvailable();
        }
        saved = touched.result;
        touchedCategoryName = touched.categoryName;
      } else {
        applyEdit(listing);
        try {
          saved = await listing.save();
        } catch (saveError) {
          // Mongoose's version check failed: this edit sets the images, and another save changed
          // them since `listing` was read.
          throw saveError instanceof mongoose.Error.VersionError ? listingChanged() : saveError;
        }
      }
    } catch (dbError) {
      if (newUploadedAssets.length > 0) {
        try {
          await this.imageStorage.delete(newUploadedAssets.map((a) => a.publicId));
        } catch {
          // Suppress
        }
      }
      throw dbError;
    }

    // The edit is stored from here on, with the new images: a failure below must not delete them.
    // The removed images are deleted only now, as the stored toy no longer uses them (with a
    // category change, the transaction has committed).
    if (toDelete.length > 0) {
      try {
        await this.imageStorage.delete(toDelete);
      } catch {
        // Cleanup failure does not fail the DB update
      }
    }

    const soldSet = await this.ports.getSoldToyIds([toyId]);
    const derivedStatus: ListingFilterStatus = soldSet.has(toyId) ? 'sold' : saved.status;
    const categoryNames =
      touchedCategoryName !== undefined
        ? new Map([[saved.categoryId.toString(), touchedCategoryName]])
        : await this.ports.getCategoryNames([saved.categoryId.toString()]);
    return this.mapToDto(saved, derivedStatus, categoryNames);
  }

  public async hide(actor: RequestActor, toyId: string): Promise<ToyListingDto> {
    this.assertActor(actor);

    if (!toyId || !mongoose.Types.ObjectId.isValid(toyId)) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    const listing = await this.toyModel.findById(toyId);
    if (!listing) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    if (listing.ownerId.toString() !== actor.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not own this listing');
    }

    // R03 III.3.2.1: a listing waiting for review offers only Edit and Delete.
    if (listing.status === 'pending') {
      throw new AppError(
        409,
        'LISTING_PENDING_REVIEW',
        'A listing waiting for review cannot be hidden. Edit or delete it instead.',
      );
    }

    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot hide listing with unfinished orders');
    }

    listing.status = 'hidden';
    const saved = await listing.save();
    // D-06: a hidden donation post takes no new requests, so its pending ones are closed. A
    // failure here fails the call; hiding again (the toy is already hidden) closes the rest.
    if (isDonationPost(saved)) {
      await this.ports.closePendingDonationRequests?.(toyId, actor.userId, 'HIDDEN', saved.title);
    }

    const soldSet = await this.ports.getSoldToyIds([toyId]);
    const derivedStatus: ListingFilterStatus = soldSet.has(toyId) ? 'sold' : saved.status;
    const categoryNames = await this.ports.getCategoryNames([saved.categoryId.toString()]);
    return this.mapToDto(saved, derivedStatus, categoryNames);
  }

  /**
   * Shows a listing its Owner hid again (GB-08, R03 III.3.2.1): it is active at once when the Admin
   * approved it and it was not edited since, otherwise it goes back to Pending Review. A rejected
   * listing must be edited and sent again instead.
   */
  public async show(actor: RequestActor, toyId: string): Promise<ToyListingDto> {
    this.assertActor(actor);

    if (!toyId || !mongoose.Types.ObjectId.isValid(toyId)) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    const listing = await this.toyModel.findById(toyId);
    if (!listing) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    if (listing.ownerId.toString() !== actor.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not own this listing');
    }

    const soldBefore = await this.ports.getSoldToyIds([toyId]);
    if (listing.status !== 'hidden' || soldBefore.has(toyId)) {
      throw new AppError(409, 'LISTING_NOT_HIDDEN', 'Only a hidden listing can be shown again.');
    }

    if (listing.moderation?.rejectReason) {
      throw new AppError(
        409,
        'LISTING_REJECTED',
        'A rejected listing must be edited and sent for review again.',
      );
    }

    // A donation post being handed over (GB-60) or already given away stays off the lists.
    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot show listing with unfinished orders');
    }
    if (isDonationPost(listing) && (await this.ports.isDonated?.(toyId))) {
      throw new AppError(409, 'TOY_DONATED', 'A donated toy cannot be shown again.');
    }
    // GB-60: after the Admin cancelled its Shipping request, a donation post stays hidden until the
    // Donor edits it (the edit sends it back to review), so it cannot simply be shown again.
    if (
      isDonationPost(listing) &&
      (await this.ports.hasCancelledShipment?.(toyId, listing.moderation?.reviewedAt)) === true
    ) {
      throw new AppError(
        409,
        'LISTING_NEEDS_EDIT',
        'Tin quyên góp này cần được sửa và gửi duyệt lại trước khi hiện lại.',
      );
    }

    if (editedSinceReview(listing)) {
      listing.moderation ??= {};
      // Back in the Admin queue from now on (oldest first).
      listing.moderation.submittedAt = new Date();
      listing.status = 'pending';
    } else {
      listing.status = 'active';
    }
    const saved = await listing.save();

    const categoryNames = await this.ports.getCategoryNames([saved.categoryId.toString()]);
    return this.mapToDto(saved, saved.status, categoryNames);
  }

  public async delete(actor: RequestActor, toyId: string): Promise<void> {
    this.assertActor(actor);

    if (!toyId || !mongoose.Types.ObjectId.isValid(toyId)) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    const listing = await this.toyModel.findById(toyId);
    if (!listing) {
      throw new AppError(404, 'NOT_FOUND', 'Listing not found');
    }

    if (listing.ownerId.toString() !== actor.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not own this listing');
    }

    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot delete listing with unfinished orders');
    }

    const publicIds = (listing.images || [])
      .map((img) => img.publicId)
      .filter((id) => typeof id === 'string' && id.trim().length > 0);

    await this.toyModel.findByIdAndDelete(toyId);
    // D-06: the pending requests of a deleted donation post are closed (the title is passed, as
    // the toy can no longer be read). The toy is gone and the call cannot be repeated, so a
    // failure is only logged: the expiry job (JOB-10) still closes what is left.
    if (isDonationPost(listing)) {
      await this.ports
        .closePendingDonationRequests?.(toyId, actor.userId, 'DELETED', listing.title)
        .catch((error: unknown) =>
          console.error('Failed to close the pending donation requests of a deleted post:', {
            toyId,
            error,
          }),
        );
    }

    if (publicIds.length > 0) {
      try {
        await this.imageStorage.delete(publicIds);
      } catch (cleanupError) {
        console.error('Failed to cleanup image assets for deleted listing:', {
          toyId,
          publicIds,
          error: cleanupError,
        });
        throw new AppError(
          500,
          'STORAGE_CLEANUP_ERROR',
          'Listing deleted but image cleanup failed',
          {
            publicIds,
            originalError:
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          },
        );
      }
    }
  }
}
