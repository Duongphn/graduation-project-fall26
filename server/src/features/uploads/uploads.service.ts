import { randomBytes } from 'node:crypto';

import { createUploadSignature } from '../../infrastructure/storage/cloudinary.js';
import { AppError, forbidden } from '../../shared/errors/app-error.js';
import type { RequestAuth } from '../../shared/middleware/auth-placeholder.js';
import { uploadPurposes, type UploadPurpose } from './uploads.schemas.js';

/**
 * Size limit the client enforces before uploading. Cloudinary's own hard limit is set on the
 * account (upload preset / plan), not per signed request.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The public_id of a new upload: "<purpose folder>/<uploader id>/<random>". The uploader segment
 * lets later endpoints check that a submitted private image (handover, identity, dispute) was
 * uploaded by the caller.
 */
export const uploadPublicId = (purpose: UploadPurpose, userId: string): string =>
  `${uploadPurposes[purpose].folder}/${userId}/${randomBytes(12).toString('hex')}`;

/** Signs one direct upload for `purpose`, bound to the caller. */
export const signUpload = (purpose: UploadPurpose, auth: RequestAuth) => {
  const target = uploadPurposes[purpose];
  if (target.adminOnly && auth.role !== 'ADMIN') throw forbidden();

  const signature = createUploadSignature({
    publicId: uploadPublicId(purpose, auth.userId),
    type: target.type,
  });
  if (!signature) {
    throw new AppError(503, 'UPLOAD_NOT_CONFIGURED', 'Chức năng tải ảnh chưa được cấu hình.');
  }
  return { ...signature, maxFileBytes: MAX_UPLOAD_BYTES };
};
