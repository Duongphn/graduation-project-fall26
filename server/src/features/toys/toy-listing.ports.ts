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
  /** Category name, also when the category is HIDDEN (empty string if it no longer exists). */
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
  moderation?: ToyModeration;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToyListingPorts {
  isVerifiedUser(userId: string): Promise<boolean>;
  categoryExists(categoryId: string): Promise<boolean>;
  /**
   * Runs `save` in a transaction that first touches the category (conditional write on
   * `{ _id, status: 'ACTIVE' }`, see categories/README.md), so a concurrent hide or delete of the
   * category conflicts with the toy save. Resolves null, without calling `save`, when the
   * category is missing or not ACTIVE; otherwise the save result plus the category name read by
   * the same touch write, so callers need no extra name lookup.
   */
  saveWithActiveCategory<T>(
    categoryId: string,
    save: (session: ClientSession) => Promise<T>,
  ): Promise<{ result: T; categoryName: string } | null>;
  hasUnfinishedOrder(toyId: string): Promise<boolean>;
  getSoldToyIds(toyIds: string[]): Promise<Set<string>>;
  /** Names of the given categories, whatever their status (HIDDEN included). */
  getCategoryNames(categoryIds: string[]): Promise<Map<string, string>>;
}
