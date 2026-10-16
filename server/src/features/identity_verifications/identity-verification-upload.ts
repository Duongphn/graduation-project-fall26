import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../../shared/errors/app-error.js';

export type AllowedIdentityImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const JPEG_HEADER = [0xff, 0xd8, 0xff];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_HEADER = [0x52, 0x49, 0x46, 0x46]; // 'RIFF'
const WEBP_HEADER = [0x57, 0x45, 0x42, 0x50]; // 'WEBP'

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

const multerFieldsUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

export const identityVerificationUpload: RequestHandler = (req, res, next) => {
  multerFieldsUpload(req, res, (err) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(400, 'FILE_TOO_LARGE', 'Each image must be at most 5 MB.', {
              code: err.code,
              field: err.field,
            }),
          );
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            new AppError(400, 'UNEXPECTED_FIELD', `Unexpected upload field: ${err.field || 'unknown'}`, {
              code: err.code,
              field: err.field,
            }),
          );
        }
        return next(
          new AppError(400, 'UNEXPECTED_FIELD', err.message, { code: err.code }),
        );
      }

      if (err instanceof AppError) {
        return next(err);
      }

      return next(
        new AppError(
          400,
          'INVALID_IMAGE_TYPE',
          err instanceof Error ? err.message : 'Image upload failed.',
        ),
      );
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const requiredFields = ['frontImage', 'backImage', 'selfie'] as const;

    if (!files || Object.keys(files).length === 0) {
      return next(
        new AppError(
          400,
          'MISSING_REQUIRED_IMAGE',
          'Missing required image: frontImage, backImage, and selfie must be uploaded.',
        ),
      );
    }

    for (const field of requiredFields) {
      const fieldFiles = files[field];
      if (!fieldFiles || fieldFiles.length === 0) {
        return next(
          new AppError(
            400,
            'MISSING_REQUIRED_IMAGE',
            `Missing required image: ${field} is required.`,
          ),
        );
      }

      const file = fieldFiles[0];
      if (!file) {
        return next(
          new AppError(
            400,
            'MISSING_REQUIRED_IMAGE',
            `Missing required image: ${field} is required.`,
          ),
        );
      }
      try {
        validateIdentityImageBuffer(file.buffer, file.mimetype);
      } catch (validationError) {
        return next(validationError);
      }
    }

    next();
  });
};
