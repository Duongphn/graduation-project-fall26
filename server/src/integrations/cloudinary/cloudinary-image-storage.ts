import type { UploadApiResponse } from 'cloudinary';
import { type CloudinaryClient, configureCloudinary } from './cloudinary-client.js';
import type { ToyImageStorage } from '../../interfaces/toy-listing.ports.js';

export interface CloudinaryImageStorageOptions {
  client?: CloudinaryClient;
  folder?: string;
}

export class CloudinaryImageStorage implements ToyImageStorage {
  private readonly client: CloudinaryClient;
  private readonly folder: string;

  public constructor(options?: CloudinaryImageStorageOptions | CloudinaryClient) {
    if (options && 'uploader' in options) {
      this.client = options;
      this.folder = 'toyflow/toys';
    } else {
      this.client = options?.client ?? configureCloudinary();
      this.folder = options?.folder ?? 'toyflow/toys';
    }
  }

  public async upload(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ url: string; publicId: string }> {
    void mimeType;
    return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
      const uploadStream = this.client.uploader.upload_stream(
        {
          folder: this.folder,
          resource_type: 'image',
        },
        (error, result?: UploadApiResponse) => {
          if (error) {
            return reject(error);
          }
          if (!result || !result.secure_url || !result.public_id) {
            return reject(
              new Error('Cloudinary upload completed without returning image details.'),
            );
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.on('error', (err) => {
        reject(err);
      });

      uploadStream.end(buffer);
    });
  }

  public async delete(publicIds: string[]): Promise<void> {
    const validPublicIds = publicIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
    if (validPublicIds.length === 0) {
      return;
    }

    await this.client.api.delete_resources(validPublicIds);
  }
}
