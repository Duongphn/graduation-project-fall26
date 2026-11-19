import { type RentalPhotoStorage } from '../interfaces/rental-order.ports.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';
import { AppError } from '../utils/app-error.js';
import { validateToyImage } from '../utils/image-validation.js';

export interface PhotoLimits {
  min: number;
  max: number;
}

/** Validates then uploads the photos; already uploaded photos are deleted if one upload fails. */
export async function uploadPhotos(
  storage: RentalPhotoStorage,
  files: Express.Multer.File[],
  limits: PhotoLimits,
): Promise<ToyImage[]> {
  const list = files ?? [];
  if (list.length < limits.min) {
    throw new AppError(
      400,
      'INVALID_IMAGE_UPLOAD',
      `Vui lòng cung cấp ít nhất ${limits.min} ảnh chụp.`,
    );
  }
  if (list.length > limits.max) {
    throw new AppError(
      400,
      'INVALID_IMAGE_UPLOAD',
      `Chỉ được tải lên tối đa ${limits.max} ảnh chụp.`,
    );
  }
  if (list.length === 0) {
    return [];
  }

  for (const file of list) {
    validateToyImage(file.buffer, file.mimetype);
  }

  const uploaded: ToyImage[] = [];
  try {
    for (const file of list) {
      const item = await storage.upload(file.buffer, file.mimetype);
      uploaded.push(item);
    }
    return uploaded;
  } catch (err) {
    if (uploaded.length > 0) {
      await storage.delete(uploaded.map((p) => p.publicId)).catch(() => {});
    }
    throw err;
  }
}

/**
 * Upload ảnh rồi chạy `work` (chỉ gồm transaction). Ảnh chỉ bị xoá khi `work` lỗi;
 * thông báo phải gửi sau khi hàm này trả về để lỗi sau commit không xoá ảnh đơn đang dùng.
 */
export async function withUploadedPhotos<T>(
  storage: RentalPhotoStorage,
  files: Express.Multer.File[],
  limits: PhotoLimits,
  work: (photos: ToyImage[]) => Promise<T>,
): Promise<T> {
  const photos = await uploadPhotos(storage, files, limits);
  try {
    return await work(photos);
  } catch (err) {
    if (photos.length > 0) {
      await storage.delete(photos.map((p) => p.publicId)).catch(() => {});
    }
    throw err;
  }
}
