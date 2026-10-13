import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../../shared/errors/app-error.js';

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

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
}).array('images', 10);

export const toyImageUpload: RequestHandler = (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof MulterError) {
      let message = err.message;
      if (err.code === 'LIMIT_FILE_SIZE') {
        message = 'Each image must be at most 5 MB.';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        message = 'A maximum of 10 images can be uploaded.';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = 'Unexpected image upload field or exceeded maximum limit of 10 images.';
      }

      return next(new AppError(400, 'INVALID_IMAGE_UPLOAD', message, { code: err.code }));
    }

    if (err instanceof AppError) {
      return next(err);
    }

    return next(
      new AppError(
        400,
        'INVALID_IMAGE_UPLOAD',
        err instanceof Error ? err.message : 'Image upload failed.',
      ),
    );
  });
};
