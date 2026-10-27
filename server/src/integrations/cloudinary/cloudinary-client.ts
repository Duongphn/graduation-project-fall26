import { v2 as cloudinary } from 'cloudinary';

export type CloudinaryClient = typeof cloudinary;

export interface CloudinaryClientConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  secure?: boolean;
}

export function configureCloudinary(config?: CloudinaryClientConfig): CloudinaryClient {
  const cloudName = config?.cloudName ?? process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = config?.apiKey ?? process.env.CLOUDINARY_API_KEY;
  const apiSecret = config?.apiSecret ?? process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing required Cloudinary credentials. Ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.',
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: config?.secure ?? true,
  });

  return cloudinary;
}

export function getCloudinaryClient(config?: CloudinaryClientConfig): CloudinaryClient {
  return configureCloudinary(config);
}
