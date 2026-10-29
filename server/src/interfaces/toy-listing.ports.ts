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
  hasUnfinishedOrder(toyId: string): Promise<boolean>;
  getSoldToyIds(toyIds: string[]): Promise<Set<string>>;
}

/** Lưu ảnh tin đăng; bản thật là integrations/cloudinary/cloudinary-image-storage.ts */
export interface ToyImageStorage {
  upload(buffer: Buffer, mimeType: string): Promise<{ url: string; publicId: string }>;
  delete(publicIds: string[]): Promise<void>;
}
