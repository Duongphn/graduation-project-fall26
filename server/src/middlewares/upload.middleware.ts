import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../utils/app-error.js';
import { validateIdentityImageBuffer } from '../utils/image-validation.js';

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
