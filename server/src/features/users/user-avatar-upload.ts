import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../../shared/errors/app-error.js';
import { validateIdentityImageBuffer } from '../identity_verifications/identity-verification-upload.js';

const multerAvatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single('avatar');

export const userAvatarUpload: RequestHandler = (req, res, next) => {
  multerAvatarUpload(req, res, (err) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(400, 'FILE_TOO_LARGE', 'Avatar image must be at most 5 MB.', {
              code: err.code,
            }),
          );
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            new AppError(400, 'UNEXPECTED_FIELD', `Unexpected field: ${err.field || 'unknown'}`, {
              code: err.code,
            }),
          );
        }
        return next(new AppError(400, 'UNEXPECTED_FIELD', err.message, { code: err.code }));
      }

      if (err instanceof AppError) {
        return next(err);
      }

      return next(
        new AppError(
          400,
          'INVALID_IMAGE_TYPE',
          err instanceof Error ? err.message : 'Avatar upload failed.',
        ),
      );
    }

    if (!req.file) {
      return next(
        new AppError(
          400,
          'MISSING_REQUIRED_IMAGE',
          'Avatar file is required under field name "avatar".',
        ),
      );
    }

    try {
      validateIdentityImageBuffer(req.file.buffer, req.file.mimetype);
    } catch (validationErr) {
      return next(validationErr);
    }

    next();
  });
};
