export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type UserVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface UserAddress {
  province: string;
  district: string;
  ward: string;
  street: string;
}

export interface StoredIdentityImage {
  publicId: string;
  deliveryType: 'authenticated';
}

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface IdentityVerificationFiles {
  frontImage: UploadedImageFile;
  backImage: UploadedImageFile;
  selfie: UploadedImageFile;
}

export interface IdentityImageStorage {
  upload(buffer: Buffer, mimeType: string): Promise<StoredIdentityImage>;
  delete(images: StoredIdentityImage[]): Promise<void>;
  getAuthorizedDelivery(publicId: string): Promise<{ url: string; expiresAt: Date }>;
}

export interface AdminQueueItem {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  idCardNumber: string;
  status: VerificationStatus;
  submittedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthorizedImageLink {
  url: string;
  expiresAt: Date;
}

export interface AdminVerificationDetail {
  id: string;
  userId: string;
  user: {
    fullName: string;
    email: string;
    phone: string;
  };
  phone: string;
  idCardNumber: string;
  frontImage: AuthorizedImageLink;
  backImage: AuthorizedImageLink;
  selfie: AuthorizedImageLink;
  status: VerificationStatus;
  rejectionReason: string | null;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

export interface ReviewReceipt {
  id: string;
  status: VerificationStatus;
  reviewedAt: Date;
  reviewedBy: string;
  rejectionReason?: string;
}

export interface IdentityVerificationEvents {
  publishStatusChanged(userId: string, status: VerificationStatus, rejectionReason?: string): Promise<void>;
}
