import 'multer';
import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import type { ToyImageStorage } from '../interfaces/toy-listing.ports.js';
import { validateToyImage } from '../utils/image-validation.js';
import { Toy, type IToy } from '../models/toy.model.js';
import type {
  ListingFilterStatus,
  ToyImage,
  ToyListingDto,
  ToyListingPorts,
} from '../interfaces/toy-listing.ports.js';
import {
  type CreateToyListingInput,
  type UpdateToyListingInput,
  validateCreateToyListingInput,
  validateUpdateToyListingInput,
} from '../validations/toy-listing.validation.js';

const categoryNotAvailable = () =>
  new AppError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive');

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
      ...(doc.moderation ? { moderation: doc.moderation } : {}),
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
      throw categoryNotAvailable();
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
            ageRange: validatedInput.ageRange,
            images: uploadedAssets,
            quantity: 1,
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

    const effectiveListingType = validatedInput.listingType ?? listing.listingType;
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

    const existingImages = listing.images || [];
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
    };

    try {
      let saved: typeof listing;
      // Set when the category changed: the touch write already returned the new category's name.
      let touchedCategoryName: string | undefined;
      if (categoryChanged) {
        const touched = await this.ports.saveWithActiveCategory(newCategoryId, async (session) => {
          // Re-read and edit the toy on every run of the callback: withTransaction runs it again
          // when the commit fails with a transient error, and a document saved by an earlier run
          // has no change left to write.
          const toy = await this.toyModel.findById(toyId, null, { session });
          if (!toy) {
            throw new AppError(404, 'NOT_FOUND', 'Listing not found');
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
        saved = await listing.save();
      }

      // Deleted only now: the stored toy no longer uses them (with a category change, the
      // transaction has committed).
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

    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot hide listing with unfinished orders');
    }

    listing.status = 'hidden';
    const saved = await listing.save();

    const soldSet = await this.ports.getSoldToyIds([toyId]);
    const derivedStatus: ListingFilterStatus = soldSet.has(toyId) ? 'sold' : saved.status;
    const categoryNames = await this.ports.getCategoryNames([saved.categoryId.toString()]);
    return this.mapToDto(saved, derivedStatus, categoryNames);
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
