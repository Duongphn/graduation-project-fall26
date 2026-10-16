import type { UploadApiResponse } from 'cloudinary';
import { type CloudinaryClient, configureCloudinary } from './cloudinary-client.js';
import type {
  IdentityImageStorage,
  StoredIdentityImage,
} from '../../features/identity_verifications/identity-verification.ports.js';

/**
 * Cloudinary private delivery strategy documentation:
 *
 * Identity verification assets (front, back, selfie) contain sensitive personal data (CCCD, portrait).
 * These assets are stored using Cloudinary's `type: 'authenticated'` mode so they are NEVER publicly accessible.
 *
 * Delivery mechanism:
 * - Assets are uploaded with `type: 'authenticated'` into folder `toyflow/identity`.
 * - Authorized delivery uses short-lived expiring signed URLs generated via Cloudinary's
 *   `cloudinary.utils.private_download_url` (or `cloudinary.url` with `sign_url: true, type: 'authenticated'`).
 * - Default expiration window is 3600 seconds (1 hour).
 * - Standard public URLs (`https://res.cloudinary.com/.../upload/...`) are never returned or stored for identity documents.
 * - Resource deletion explicitly specifies `{ type: 'authenticated' }` to ensure Cloudinary resolves
 *   and removes authenticated assets cleanly.
 */

export interface CloudinaryIdentityStorageOptions {
  client?: CloudinaryClient;
  folder?: string;
  expiresInSeconds?: number;
}

export class CloudinaryIdentityStorage implements IdentityImageStorage {
  private readonly client: CloudinaryClient;
  private readonly folder: string;
  private readonly expiresInSeconds: number;

  public constructor(options?: CloudinaryIdentityStorageOptions | CloudinaryClient) {
    if (options && 'uploader' in options) {
      this.client = options;
      this.folder = 'toyflow/identity';
      this.expiresInSeconds = 3600;
    } else {
      this.client = options?.client ?? configureCloudinary();
      this.folder = options?.folder ?? 'toyflow/identity';
      this.expiresInSeconds = options?.expiresInSeconds ?? 3600;
    }
  }

  public async upload(buffer: Buffer, mimeType: string): Promise<StoredIdentityImage> {
    void mimeType;
    return new Promise<StoredIdentityImage>((resolve, reject) => {
      const uploadStream = this.client.uploader.upload_stream(
        {
          folder: this.folder,
          resource_type: 'image',
          type: 'authenticated',
        },
        (error, result?: UploadApiResponse) => {
          if (error) {
            return reject(error);
          }
          if (!result || !result.public_id) {
            return reject(
              new Error('Cloudinary upload completed without returning image details.'),
            );
          }
          resolve({
            publicId: result.public_id,
            deliveryType: 'authenticated',
          });
        },
      );

      uploadStream.on('error', (err) => {
        reject(err);
      });

      uploadStream.end(buffer);
    });
  }

  public async delete(images: StoredIdentityImage[]): Promise<void> {
    const validPublicIds = images
      .map((img) => img?.publicId)
      .filter((id) => typeof id === 'string' && id.trim().length > 0);

    if (validPublicIds.length === 0) {
      return;
    }

    await this.client.api.delete_resources(validPublicIds, { type: 'authenticated' });
  }

  public async getAuthorizedDelivery(
    publicId: string,
    expiresInSeconds: number = this.expiresInSeconds,
  ): Promise<{ url: string; expiresAt: Date }> {
    if (!publicId || typeof publicId !== 'string' || publicId.trim().length === 0) {
      throw new Error('Public ID is required to generate authorized delivery URL.');
    }

    const expiresAtTimestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const expiresAt = new Date(expiresAtTimestamp * 1000);

    let url: string;
    if (typeof this.client.utils?.private_download_url === 'function') {
      url = this.client.utils.private_download_url(publicId, '', {
        expires_at: expiresAtTimestamp,
      });
    } else {
      url = this.client.url(publicId, {
        sign_url: true,
        type: 'authenticated',
        secure: true,
        expires_at: expiresAtTimestamp,
      });
    }

    return { url, expiresAt };
  }
}
