import { AppError } from './app-error.js';

export type AllowedToyImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const JPEG_HEADER = [0xff, 0xd8, 0xff];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_HEADER = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_HEADER = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

const isJpegSignature = (buffer: Buffer): boolean => {
  if (buffer.length < JPEG_HEADER.length) {
    return false;
  }
  return JPEG_HEADER.every((byte, index) => buffer[index] === byte);
};

const isPngSignature = (buffer: Buffer): boolean => {
  if (buffer.length < PNG_HEADER.length) {
    return false;
  }
  return PNG_HEADER.every((byte, index) => buffer[index] === byte);
};

const isWebpSignature = (buffer: Buffer): boolean => {
  if (buffer.length < 12) {
    return false;
  }
  const startsWithRiff = RIFF_HEADER.every((byte, index) => buffer[index] === byte);
  const containsWebp = WEBP_HEADER.every((byte, index) => buffer[index + 8] === byte);
  return startsWithRiff && containsWebp;
};

export const validateToyImage = (buffer: Buffer, mimeType?: string): AllowedToyImageMimeType => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 3) {
    throw new AppError(400, 'INVALID_IMAGE_FORMAT', 'Uploaded image file is empty or corrupted.');
  }

  const normalizedMime = mimeType?.split(';')[0]?.trim().toLowerCase();

  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    if (!isJpegSignature(buffer)) {
      throw new AppError(
        400,
        'INVALID_IMAGE_FORMAT',
        'Image content does not match JPEG file signature.',
      );
    }
    return 'image/jpeg';
  }

  if (normalizedMime === 'image/png') {
    if (!isPngSignature(buffer)) {
      throw new AppError(
        400,
        'INVALID_IMAGE_FORMAT',
        'Image content does not match PNG file signature.',
      );
    }
    return 'image/png';
  }

  if (normalizedMime === 'image/webp') {
    if (!isWebpSignature(buffer)) {
      throw new AppError(
        400,
        'INVALID_IMAGE_FORMAT',
        'Image content does not match WebP file signature.',
      );
    }
    return 'image/webp';
  }

  const formatName = mimeType ? `"${mimeType}"` : 'provided';
  throw new AppError(
    400,
    'INVALID_IMAGE_FORMAT',
    `Unsupported image format ${formatName}. Allowed formats are JPEG, PNG, and WebP.`,
  );
};

export type AllowedIdentityImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export const validateIdentityImageBuffer = (
  buffer: Buffer,
  mimeType?: string,
): AllowedIdentityImageMimeType => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 3) {
    throw new AppError(400, 'INVALID_IMAGE_TYPE', 'Buffer is too small or invalid.');
  }

  const headStr = buffer.subarray(0, Math.min(buffer.length, 100)).toString('utf8').toLowerCase();
  if (
    mimeType === 'image/svg+xml' ||
    headStr.includes('<svg') ||
    headStr.includes('<?xml')
  ) {
    throw new AppError(400, 'INVALID_IMAGE_TYPE', 'SVG images are not permitted.');
  }

  let detectedType: AllowedIdentityImageMimeType | null = null;
  if (isJpegSignature(buffer)) {
    detectedType = 'image/jpeg';
  } else if (isPngSignature(buffer)) {
    detectedType = 'image/png';
  } else if (isWebpSignature(buffer)) {
    detectedType = 'image/webp';
  }

  if (!detectedType) {
    throw new AppError(
      400,
      'INVALID_IMAGE_TYPE',
      'Image content does not match allowed signatures (JPEG, PNG, WebP).',
    );
  }

  if (mimeType) {
    const normalized = mimeType.toLowerCase();
    const isJpegMatch =
      (normalized === 'image/jpeg' || normalized === 'image/jpg') && detectedType === 'image/jpeg';
    if (!isJpegMatch && normalized !== detectedType) {
      throw new AppError(
        400,
        'INVALID_IMAGE_TYPE',
        `MIME type "${mimeType}" does not match signature "${detectedType}".`,
      );
    }
  }

  return detectedType;
};
