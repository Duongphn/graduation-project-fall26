import 'multer';
import mongoose, { type Model } from 'mongoose';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import type { ToyImageStorage } from '../integrations/cloudinary/cloudinary-image-storage.js';
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

export class ToyListingService {
  public constructor(
    private readonly ports: ToyListingPorts,
    private readonly imageStorage: ToyImageStorage,
    private readonly toyModel: Model<IToy> = Toy,
  ) {}

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

    try {
      if (validatedInput.title !== undefined) listing.title = validatedInput.title;
      if (validatedInput.description !== undefined)
        listing.description = validatedInput.description;
      if (validatedInput.condition !== undefined) listing.condition = validatedInput.condition;
      if (validatedInput.categoryId !== undefined) {
        listing.categoryId = new mongoose.Types.ObjectId(validatedInput.categoryId);
      }
      if (validatedInput.ageRange !== undefined) listing.ageRange = validatedInput.ageRange;
      if (validatedInput.listingType !== undefined)
        listing.listingType = validatedInput.listingType;
      if (validatedInput.priceOrRate !== undefined)
        listing.priceOrRate = validatedInput.priceOrRate;

      if (effectiveListingType === 'rent') {
        if (validatedInput.depositPrice !== undefined) {
          listing.depositPrice = validatedInput.depositPrice;
        }
      } else {
        listing.depositPrice = undefined;
      }

      listing.images = [...remainingImages, ...newUploadedAssets];

      const saved = await listing.save();

      if (toDelete.length > 0) {
        try {
          await this.imageStorage.delete(toDelete);
        } catch {
          // Cleanup failure does not fail the DB update
        }
      }

      const soldSet = await this.ports.getSoldToyIds([toyId]);
      const derivedStatus: ListingFilterStatus = soldSet.has(toyId) ? 'sold' : saved.status;
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

    const hasUnfinished = await this.ports.hasUnfinishedOrder(toyId);
    if (hasUnfinished) {
      throw new AppError(409, 'ORDER_IN_PROGRESS', 'Cannot hide listing with unfinished orders');
    }

    listing.status = 'hidden';
    const saved = await listing.save();

    const soldSet = await this.ports.getSoldToyIds([toyId]);
    const derivedStatus: ListingFilterStatus = soldSet.has(toyId) ? 'sold' : saved.status;
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
