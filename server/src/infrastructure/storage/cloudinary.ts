import { createHash } from 'node:crypto';

import { env } from '../../config/env.js';

// Cloudinary without the SDK (node:crypto is enough):
// - signed direct uploads from the browser (the API secret never leaves the server);
// - time-limited links to private ("authenticated") assets: identity documents, handover and
//   dispute photos (R04 III.1.3, GB-35).
//
// Signature (Cloudinary "authentication signatures"): take every parameter except api_key,
// resource_type, cloud_name, file and signature; drop empty values; sort by name; join as
// "name=value" with "&"; append the api_secret; SHA-1 (hex).

export interface CloudinaryCredentials {
  cloudName?: string | undefined;
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
}

export interface ConfiguredCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export type CloudinaryDeliveryType = 'upload' | 'authenticated';

/** R04 III.1.3: links to private documents are valid for 5 minutes. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

const CLOUDINARY_API_BASE = 'https://api.cloudinary.com/v1_1';
const UNSIGNED_PARAMS = new Set(['api_key', 'resource_type', 'cloud_name', 'file', 'signature']);

export type SignableParams = Record<string, string | number | undefined | null>;

export const isCloudinaryConfigured = (
  credentials: CloudinaryCredentials = developCloudinaryCredentials(),
): credentials is ConfiguredCloudinary =>
  Boolean(credentials.cloudName && credentials.apiKey && credentials.apiSecret);

/** The exact string Cloudinary hashes (without the secret). */
export const buildStringToSign = (params: SignableParams): string =>
  Object.entries(params)
    .filter(
      ([name, value]) =>
        !UNSIGNED_PARAMS.has(name) && value !== undefined && value !== null && value !== '',
    )
    .map(([name, value]) => `${name}=${String(value)}`)
    .sort()
    .join('&');

export const signCloudinaryParams = (params: SignableParams, apiSecret: string): string =>
  createHash('sha1')
    .update(buildStringToSign(params) + apiSecret)
    .digest('hex');

/** Develop's Cloudinary settings (config/env.ts). */
const developCloudinaryCredentials = (): CloudinaryCredentials => ({
  cloudName: env.cloudinaryCloudName || undefined,
  apiKey: env.cloudinaryApiKey || undefined,
  apiSecret: env.cloudinaryApiSecret || undefined,
});

const unixSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/** Image formats a signed upload accepts (Cloudinary `allowed_formats`). */
export const UPLOAD_ALLOWED_FORMATS = 'jpg,jpeg,png,webp';

export interface UploadTarget {
  // The full public_id chosen by the server, e.g. "toyflow/handovers/<userId>/<random>".
  publicId: string;
  type: CloudinaryDeliveryType;
}

export interface UploadSignature {
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  publicId: string;
  type: CloudinaryDeliveryType;
  allowedFormats: string;
  signature: string;
  /** Every multipart field to send with the file, exactly as signed. */
  fields: Record<string, string>;
}

/**
 * Parameters for ONE signed image upload to the server-chosen `publicId`. The browser posts
 * `fields` with the file to `uploadUrl`; Cloudinary rejects any other public_id, type or
 * format. With overwrite=false a replayed signature cannot replace or add images: the id is
 * fixed and already taken. Null when Cloudinary is not configured.
 */
export const createUploadSignature = (
  target: UploadTarget,
  options: { now?: Date; credentials?: CloudinaryCredentials } = {},
): UploadSignature | null => {
  const credentials = options.credentials ?? developCloudinaryCredentials();
  if (!isCloudinaryConfigured(credentials)) return null;
  const timestamp = unixSeconds(options.now ?? new Date());
  const signed = {
    allowed_formats: UPLOAD_ALLOWED_FORMATS,
    overwrite: 'false',
    public_id: target.publicId,
    timestamp: String(timestamp),
    type: target.type,
  };
  const signature = signCloudinaryParams(signed, credentials.apiSecret);
  return {
    uploadUrl: `${CLOUDINARY_API_BASE}/${encodeURIComponent(credentials.cloudName)}/image/upload`,
    cloudName: credentials.cloudName,
    apiKey: credentials.apiKey,
    timestamp,
    publicId: target.publicId,
    type: target.type,
    allowedFormats: UPLOAD_ALLOWED_FORMATS,
    signature,
    fields: { ...signed, api_key: credentials.apiKey, signature },
  };
};

export interface SignedAssetUrl {
  url: string;
  expiresAt: Date;
}

/**
 * A signed, time-limited link to one private image (Cloudinary "private download URL"), or
 * null when Cloudinary is not configured.
 */
export const buildPrivateImageUrl = (
  image: { publicId: string; format: string },
  options: { ttlSeconds?: number; now?: Date; credentials?: CloudinaryCredentials } = {},
): SignedAssetUrl | null => {
  const credentials = options.credentials ?? developCloudinaryCredentials();
  if (!isCloudinaryConfigured(credentials)) return null;

  const timestamp = unixSeconds(options.now ?? new Date());
  const expiresAt = timestamp + (options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS);
  const params = {
    expires_at: expiresAt,
    format: image.format,
    public_id: image.publicId,
    timestamp,
    type: 'authenticated',
  };
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)])),
    signature: signCloudinaryParams(params, credentials.apiSecret),
    api_key: credentials.apiKey,
  });

  return {
    url: `${CLOUDINARY_API_BASE}/${encodeURIComponent(credentials.cloudName)}/image/download?${query.toString()}`,
    expiresAt: new Date(expiresAt * 1000),
  };
};
