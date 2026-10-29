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

export interface ToyModeration {
  submittedAt?: Date;
}

export interface ToyListingDto {
  id: string;
  ownerId: string;
  categoryId: string;
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
  moderation?: ToyModeration;
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
   */
  saveWithActiveCategory<T>(
    categoryId: string,
    save: (session: ClientSession) => Promise<T>,
  ): Promise<{ result: T; categoryName: string } | null>;
  hasUnfinishedOrder(toyId: string): Promise<boolean>;
  getSoldToyIds(toyIds: string[]): Promise<Set<string>>;
}

/** Lưu ảnh tin đăng; bản thật là integrations/cloudinary/cloudinary-image-storage.ts */
export interface ToyImageStorage {
  upload(buffer: Buffer, mimeType: string): Promise<{ url: string; publicId: string }>;
  delete(publicIds: string[]): Promise<void>;
}
