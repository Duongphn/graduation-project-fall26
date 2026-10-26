import mongoose, { type Model } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { User, type IUser } from './users.model.js';
import type {
  UserAvatarStorage,
  UserProfileDto,
} from '../../interfaces/user.ports.js';
import type { UploadedImageFile } from '../../interfaces/identity-verification.ports.js';

export class UsersService {
  public constructor(
    private readonly userModel: Model<IUser> = User,
    private readonly avatarStorage?: UserAvatarStorage,
  ) {}

  private mapToDto(user: IUser): UserProfileDto {
    const dto: UserProfileDto = {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      verificationStatus: user.verificationStatus ?? 'unverified',
      role: user.role,
    };
    if (user.avatar) {
      dto.avatarUrl = user.avatar;
    }
    if (user.address) {
      dto.address = {
        province: user.address.province,
        district: user.address.district,
        ward: user.address.ward,
        street: user.address.street,
      };
    }
    return dto;
  }

  public async getProfile(userId: string): Promise<UserProfileDto> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    }

    return this.mapToDto(user);
  }

  public async updateProfile(userId: string, patch: Record<string, unknown>): Promise<UserProfileDto> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    if (!patch || typeof patch !== 'object') {
      throw new AppError(400, 'INVALID_INPUT', 'Payload must be an object.');
    }

    const allowedKeys = new Set(['fullName', 'address']);
    const incomingKeys = Object.keys(patch);

    for (const key of incomingKeys) {
      if (!allowedKeys.has(key)) {
        throw new AppError(
          400,
          'INVALID_INPUT',
          `Field "${key}" is not allowed to be updated through profile API.`,
        );
      }
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    }

    if (patch.fullName !== undefined) {
      if (typeof patch.fullName !== 'string' || patch.fullName.trim().length === 0) {
        throw new AppError(400, 'INVALID_INPUT', 'fullName must be a non-empty string.');
      }
      user.fullName = patch.fullName.trim();
    }

    if (patch.address !== undefined) {
      const addr = patch.address as Record<string, unknown> | null;
      if (
        !addr ||
        typeof addr !== 'object' ||
        typeof addr.province !== 'string' ||
        addr.province.trim().length === 0 ||
        typeof addr.district !== 'string' ||
        addr.district.trim().length === 0 ||
        typeof addr.ward !== 'string' ||
        addr.ward.trim().length === 0 ||
        typeof addr.street !== 'string' ||
        addr.street.trim().length === 0
      ) {
        throw new AppError(
          400,
          'INVALID_INPUT',
          'Address must include valid non-empty province, district, ward, and street.',
        );
      }
      user.address = {
        province: addr.province.trim(),
        district: addr.district.trim(),
        ward: addr.ward.trim(),
        street: addr.street.trim(),
      };
    }

    await user.save();
    return this.mapToDto(user);
  }

  public async uploadAvatar(
    userId: string,
    file: UploadedImageFile,
  ): Promise<{ avatarUrl: string }> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    if (!this.avatarStorage) {
      throw new AppError(500, 'STORAGE_ERROR', 'Avatar storage is not configured.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    }

    const result = await this.avatarStorage.upload(file.buffer, file.mimetype);
    user.avatar = result.url;
    await user.save();

    return { avatarUrl: result.url };
  }
}
