import { env } from '../../config/env.js';
import type { IdentityImageStorage } from '../../interfaces/identity-verification.ports.js';
import type { UserAvatarStorage } from '../../interfaces/user.ports.js';
import { AppError } from '../../utils/app-error.js';
import { configureCloudinary } from './cloudinary-client.js';
import { CloudinaryIdentityStorage } from './cloudinary-identity-storage.js';
import type { ToyImageStorage } from '../../interfaces/toy-listing.ports.js';
import { CloudinaryImageStorage } from './cloudinary-image-storage.js';

/**
 * Adapter Cloudinary mặc định cho container.ts.
 * Thiếu credentials: ảnh đại diện và giấy tờ dùng bản giả (chạy local/test),
 * còn ảnh đồ chơi ném CLOUDINARY_NOT_CONFIGURED khi upload/xóa.
 */

export function createDefaultAvatarStorage(): UserAvatarStorage {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      async upload() {
        return {
          url: 'https://res.cloudinary.com/toyflow/image/upload/mock-avatar.jpg',
          publicId: 'toyflow/avatars/mock-avatar',
        };
      },
    };
  }

  const client = configureCloudinary({ cloudName, apiKey, apiSecret });
  return new CloudinaryImageStorage({ client, folder: 'toyflow/avatars' });
}

export function createDefaultIdentityStorage(): IdentityImageStorage {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      async upload() {
        return {
          publicId: 'toyflow/identity/mock-doc',
          deliveryType: 'authenticated',
        };
      },
      async delete() {},
      async getAuthorizedDelivery(publicId: string) {
        return {
          url: `https://api.cloudinary.com/download?publicId=${encodeURIComponent(publicId)}`,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        };
      },
    };
  }

  const client = configureCloudinary({ cloudName, apiKey, apiSecret });
  return new CloudinaryIdentityStorage({ client, folder: 'toyflow/identity' });
}

export function createDefaultToyImageStorage(): ToyImageStorage {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET;

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET ||
    !cloudName ||
    !apiKey ||
    !apiSecret
  ) {
    return {
      async upload(): Promise<{ url: string; publicId: string }> {
        throw new AppError(
          500,
          'CLOUDINARY_NOT_CONFIGURED',
          'Cloudinary credentials are not configured.',
        );
      },
      async delete(): Promise<void> {
        throw new AppError(
          500,
          'CLOUDINARY_NOT_CONFIGURED',
          'Cloudinary credentials are not configured.',
        );
      },
    };
  }

  return new CloudinaryImageStorage({
    client: configureCloudinary({ cloudName, apiKey, apiSecret }),
  });
}
