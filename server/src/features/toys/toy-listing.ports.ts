// donate (FE-02): a free donation post, no price, requested through donation_requests.
export type ListingType = 'rent' | 'sell' | 'donate';

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
  /** An ACCEPTED or SHIPPING donation request holds the toy (GB-12). */
  hasActiveDonationRequest(toyId: string): Promise<boolean>;
  /**
   * Closes (REJECTED, with a reason) the PENDING donation requests of a toy its owner has just
   * hidden or deleted, and notifies the requesters (D-06).
   */
  closePendingDonationRequests(
    toyId: string,
    ownerId: string,
    toyTitle: string,
    why: 'HIDDEN' | 'DELETED',
  ): Promise<void>;
  getSoldToyIds(toyIds: string[]): Promise<Set<string>>;
}
