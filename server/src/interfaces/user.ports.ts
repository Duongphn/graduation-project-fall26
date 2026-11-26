import type { UploadedImageFile, UserVerificationStatus } from './identity-verification.ports.js';

export type UserGender = 'female' | 'male' | 'other';

export interface UserProfileDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  /** YYYY-MM-DD, null khi chưa nhập */
  dateOfBirth: string | null;
  gender: UserGender | null;
  bio: string | null;
  /** Chỉ đọc: 0–100, mặc định 100 (GB-29) */
  trustScore: number;
  /** Ngày tham gia (ISO) */
  memberSince: string;
  verificationStatus: UserVerificationStatus;
  role: string;
}

export interface UpdateProfileInput {
  fullName?: string;
  dateOfBirth?: string | null;
  gender?: UserGender | null;
  bio?: string | null;
}

/** Một địa chỉ trong sổ địa chỉ (R03 III.6.1.1 (9)) */
export interface AddressDto {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  ward: string;
  street: string;
  isDefault: boolean;
}

export interface UserAvatarStorage {
  upload(buffer: Buffer, mimeType: string): Promise<{ url: string; publicId: string }>;
  delete?(publicIds: string[]): Promise<void>;
}

export type { UploadedImageFile };
