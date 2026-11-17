import type { ClientSession } from 'mongoose';

export type ListingType = 'rent' | 'sell';

export type StoredListingStatus = 'pending' | 'active' | 'hidden';

export type ListingFilterStatus = 'pending' | 'active' | 'hidden' | 'sold';

export interface ToyAgeRange {
  minAge: number;
  maxAge: number;
}

export interface ToyImage {
  url: string;
  publicId: string;
}

export interface ToyLocation {
  type?: string;
  coordinates?: number[];
}

/** Stored review data of a toy; `reviewedBy`, `reviewedAt` and `rejectReason` are written by the Admin moderation. */
export interface ToyModeration {
  submittedAt?: Date;
  reviewedBy?: unknown;
  reviewedAt?: Date | undefined;
  rejectReason?: string | undefined;
}

/**
 * What the Owner sees of the review (R03 III.3.2.1): when the listing was sent, and the Admin's
 * reason while it is rejected. The reviewing Admin's id is not shown.
 */
export interface OwnerModerationView {
  submittedAt?: Date;
  reviewedAt?: Date;
  rejectReason?: string;
}

export interface ToyListingDto {
  id: string;
  ownerId: string;
  categoryId: string;
  /** Category name, also when the category is hidden (empty string if it no longer exists). */
  categoryName: string;
  title: string;
  description: string;
  condition: string;
  listingType: ListingType;
  priceOrRate: number;
  depositPrice?: number;
  ageRange: ToyAgeRange;
  images: ToyImage[];
  quantity: number;
  status: ListingFilterStatus;
  location?: ToyLocation;
  moderation?: OwnerModerationView;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToyListingPorts {
  isVerifiedUser(userId: string): Promise<boolean>;
  categoryExists(categoryId: string): Promise<boolean>;
  /**
   * Runs `save` in a transaction that first touches the category (conditional write on
   * `{ _id, status: active }`), so a concurrent hide or delete of the category write-conflicts
   * with the toy save. Resolves null, without calling `save`, when the category is missing or not
   * active; otherwise the save result and the category name read by the same write.
   * `save` can run more than once: the transaction is run again after a write conflict or a
   * transient commit error. So it must build its write on every call (a new document, or the toy
   * re-read with `session`), never save a document built or saved outside it. A re-read toy must
   * not have changed since it was first read (same `__v`), or the edit is refused.
   */
  saveWithActiveCategory<T>(
    categoryId: string,
    save: (session: ClientSession) => Promise<T>,
  ): Promise<{ result: T; categoryName: string } | null>;
  hasUnfinishedOrder(toyId: string): Promise<boolean>;
  getSoldToyIds(toyIds: string[]): Promise<Set<string>>;
  /** Names of the given categories, whatever their status (hidden included). */
  getCategoryNames(categoryIds: string[]): Promise<Map<string, string>>;
}

/** Lưu ảnh tin đăng; bản thật là integrations/cloudinary/cloudinary-image-storage.ts */
export interface ToyImageStorage {
  upload(buffer: Buffer, mimeType: string): Promise<{ url: string; publicId: string }>;
  delete(publicIds: string[]): Promise<void>;
}
