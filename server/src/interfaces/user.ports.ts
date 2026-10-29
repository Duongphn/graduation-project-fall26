import type { UploadedImageFile, UserAddress, UserVerificationStatus } from './identity-verification.ports.js';

export interface UserProfileDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  address?: UserAddress;
  verificationStatus: UserVerificationStatus;
  role: string;
}

export interface UpdateProfileInput {
  fullName?: string;
  address?: UserAddress;
}

export interface UserAvatarStorage {
  upload(buffer: Buffer, mimeType: string): Promise<{ url: string; publicId: string }>;
  delete?(publicIds: string[]): Promise<void>;
}

export type { UploadedImageFile };
