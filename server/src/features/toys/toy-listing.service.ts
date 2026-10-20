import 'multer';
import mongoose, { type Model } from 'mongoose';
import type { RequestActor } from '../../shared/contracts/request-actor.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { ToyImageStorage } from '../../infrastructure/cloudinary/cloudinary-image-storage.js';
import { validateToyImage } from './toy-image-upload.js';
import { ToyModel, type IToy } from './toys.model.js';
import {
  fromStoredStatus,
  storedDeposit,
  storedImages,
  storedPrice,
  toAgeGroup,
  toListingFields,
  toStoredCondition,
  toStoredListingType,
  toStoredPricing,
  toStoredStatus,
  fromStoredListingType,
} from './toy-listing.storage.js';
import type {
  ListingFilterStatus,
  ToyImage,
  ToyListingDto,
  ToyListingPorts,
} from './toy-listing.ports.js';
import {
  type CreateToyListingInput,
  type UpdateToyListingInput,
  validateCreateToyListingInput,
  validateUpdateToyListingInput,
} from './toy-listing.schemas.js';

// A RESERVED toy belongs to an order or an ACCEPTED/SHIPPING donation request (GB-12).
const OWNER_LOCKED_STATUSES = ['RESERVED'];

const activeDonationError = (action: 'edit' | 'hide' | 'delete') =>
  new AppError(
    409,
    'TOY_HAS_ACTIVE_DONATION',
    `Cannot ${action} a listing with an accepted or in-progress donation request.`,
  );

export class ToyListingService {
  public constructor(
    private readonly ports: ToyListingPorts,
    private readonly imageStorage: ToyImageStorage,
    private readonly toyModel: Model<IToy> = ToyModel as unknown as Model<IToy>,
  ) {}

  /**
   * GB-12: a toy with an ACCEPTED or SHIPPING donation request (the toy is RESERVED) cannot
   * be edited, hidden or deleted by its owner until the request ends.
   */
  private async assertNoActiveDonation(
    toyId: string,
    action: 'edit' | 'hide' | 'delete',
  ): Promise<void> {
    if (await this.ports.hasActiveDonationRequest(toyId)) {
      throw activeDonationError(action);
    }
  }

  /** The error for a conditional write that found the toy RESERVED (a race with an accept). */
  private async changedWhileReserved(
    toyId: string,
    action: 'edit' | 'hide' | 'delete',
  ): Promise<AppError> {
    if (await this.ports.hasActiveDonationRequest(toyId)) return activeDonationError(action);
    return new AppError(409, 'TOY_STATUS_CHANGED', 'The listing has just changed, please reload.');
  }

  /**
   * Saves the owner's change only while the toy is not RESERVED: the status filter is part of
   * the update (Mongoose `$where` on save), so an accept that wins the race blocks the change.
   */
  private async saveUnlessReserved(
    listing: mongoose.HydratedDocument<IToy>,
    action: 'edit' | 'hide' = 'edit',
  ) {
    (listing as unknown as { $where?: Record<string, unknown> }).$where = {
      status: { $nin: OWNER_LOCKED_STATUSES },
    };
    try {
      return await listing.save();
    } catch (error) {
      if (error instanceof mongoose.Error.DocumentNotFoundError) {
        throw await this.changedWhileReserved(String(listing._id), action);
      }
      throw error;
    }
  }

  private assertActor(actor: RequestActor): void {
    if (
      !actor ||
      !actor.userId ||
      actor.actorType !== 'USER' ||
      !mongoose.Types.ObjectId.isValid(actor.userId)
    ) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
  }

  private mapToDto(
    doc: IToy & { _id: mongoose.Types.ObjectId | string },
    derivedStatus: ListingFilterStatus,
  ): ToyListingDto {
    return {
      id: doc._id.toString(),
      ownerId: doc.ownerId.toString(),
      categoryId: doc.categoryId.toString(),
      title: doc.title,
      description: doc.description,
      ...toListingFields(doc),
      quantity: 1,
      status: derivedStatus,
      ...(doc.location ? { location: doc.location } : {}),
      ...(doc.moderation?.submittedAt
        ? { moderation: { submittedAt: doc.moderation.submittedAt } }
        : {}),
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

    const categoryExists = await this.ports.categoryExists(validatedInput.categoryId);
    if (!categoryExists) {
      throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive');
    }

    if (!files || files.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'At least one image is required.');
    }
    if (files.length > 10) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A maximum of 10 images are allowed.');
    }

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
      const newToy = new this.toyModel({
        ownerId: new mongoose.Types.ObjectId(actor.userId),
        categoryId: new mongoose.Types.ObjectId(validatedInput.categoryId),
        title: validatedInput.title,
        description: validatedInput.description,
        condition: toStoredCondition(validatedInput.condition),
        listingType: toStoredListingType(validatedInput.listingType),
        pricing: toStoredPricing(
          validatedInput.listingType,
          validatedInput.priceOrRate,
          validatedInput.depositPrice,
        ),
        status: toStoredStatus('pending'),
        moderation: { submittedAt: new Date() },
        ageRange: validatedInput.ageRange,
        ageGroup: toAgeGroup(validatedInput.ageRange),
        images: uploadedAssets.map((asset) => asset.url),
        imagePublicIds: uploadedAssets.map((asset) => asset.publicId),
      });

      const saved = await newToy.save();
      return this.mapToDto(saved, 'pending');
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
      const derivedStatus: ListingFilterStatus = soldToyIds.has(toyIdStr)
        ? 'sold'
        : fromStoredStatus(toy.status);
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
    const items = paginated.map(({ toy, derivedStatus }) => this.mapToDto(toy, derivedStatus));

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
    await this.assertNoActiveDonation(toyId, 'edit');
    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot edit listing with unfinished orders');
    }

    const validatedInput = validateUpdateToyListingInput(input);

    if (validatedInput.categoryId) {
      const categoryExists = await this.ports.categoryExists(validatedInput.categoryId);
      if (!categoryExists) {
        throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive');
      }
    }

    const storedListingType = fromStoredListingType(listing.listingType);
    // FE-02: a donation post stays a free donation post (and a rent/sell post never becomes one).
    if (storedListingType === 'donate') {
      if (
        (validatedInput.listingType !== undefined && validatedInput.listingType !== 'donate') ||
        validatedInput.priceOrRate !== undefined ||
        validatedInput.depositPrice !== undefined
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'A donation post has no price and cannot change its listing type.',
        );
      }
    } else if (validatedInput.listingType === 'donate') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'A rent or sell post cannot become a donation post; create a donation post instead.',
      );
    }
    const effectiveListingType = validatedInput.listingType ?? storedListingType;
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
          : storedDeposit(listing);
      if (effectiveDeposit === undefined || effectiveDeposit < 0) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'depositPrice must be non-negative for rent listings.',
        );
      }
    }

    const existingImages = storedImages(listing);
    const removeSet = new Set(removeImagePublicIds ?? []);
    const remainingImages = existingImages.filter((img) => !removeSet.has(img.publicId));
    const toDelete = existingImages
      .filter((img) => removeSet.has(img.publicId))
      .map((img) => img.publicId);
    const newFiles = files ?? [];
    const finalImageCount = remainingImages.length + newFiles.length;

    if (finalImageCount < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A listing must have at least one image.');
    }
    if (finalImageCount > 10) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A listing cannot have more than 10 images.');
    }

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

    try {
      if (validatedInput.title !== undefined) listing.title = validatedInput.title;
      if (validatedInput.description !== undefined)
        listing.description = validatedInput.description;
      if (validatedInput.condition !== undefined) {
        listing.condition = toStoredCondition(validatedInput.condition);
      }
      if (validatedInput.categoryId !== undefined) {
        listing.categoryId = new mongoose.Types.ObjectId(validatedInput.categoryId);
      }
      if (validatedInput.ageRange !== undefined) {
        listing.ageRange = validatedInput.ageRange;
        listing.ageGroup = toAgeGroup(validatedInput.ageRange);
      }
      const price = validatedInput.priceOrRate ?? storedPrice(listing);
      const deposit =
        effectiveListingType === 'rent'
          ? (validatedInput.depositPrice ?? storedDeposit(listing))
          : undefined;
      listing.listingType = toStoredListingType(effectiveListingType);
      listing.pricing = toStoredPricing(effectiveListingType, price, deposit);

      const finalImages = [...remainingImages, ...newUploadedAssets];
      listing.images = finalImages.map((img) => img.url);
      listing.imagePublicIds = finalImages.map((img) => img.publicId);

      const saved = await this.saveUnlessReserved(listing);

      if (toDelete.length > 0) {
        try {
          await this.imageStorage.delete(toDelete);
        } catch {
          // Cleanup failure does not fail the DB update
        }
      }

      const soldSet = await this.ports.getSoldToyIds([toyId]);
      const derivedStatus: ListingFilterStatus = soldSet.has(toyId)
        ? 'sold'
        : fromStoredStatus(saved.status);
      return this.mapToDto(saved, derivedStatus);
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

    await this.assertNoActiveDonation(toyId, 'hide');
    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot hide listing with unfinished orders');
    }

    listing.status = toStoredStatus('hidden');
    const saved = await this.saveUnlessReserved(listing, 'hide');
    // D-06: the PENDING donation requests of a hidden toy are closed (requesters notified).
    await this.ports.closePendingDonationRequests(toyId, actor.userId, saved.title, 'HIDDEN');

    const soldSet = await this.ports.getSoldToyIds([toyId]);
    const derivedStatus: ListingFilterStatus = soldSet.has(toyId)
      ? 'sold'
      : fromStoredStatus(saved.status);
    return this.mapToDto(saved, derivedStatus);
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

    await this.assertNoActiveDonation(toyId, 'delete');
    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot delete listing with unfinished orders');
    }

    const publicIds = storedImages(listing)
      .map((img) => img.publicId)
      .filter((id) => typeof id === 'string' && id.trim().length > 0);

    // Conditional: a donation request accepted after the checks above moved the toy to
    // RESERVED, and then the delete must not happen.
    const deleted = await this.toyModel.findOneAndDelete({
      _id: toyId,
      status: { $nin: OWNER_LOCKED_STATUSES },
    });
    if (!deleted) {
      throw await this.changedWhileReserved(toyId, 'delete');
    }
    // D-06: the PENDING donation requests of a deleted toy are closed (requesters notified).
    await this.ports.closePendingDonationRequests(toyId, actor.userId, listing.title, 'DELETED');

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
