import mongoose, { type Model } from 'mongoose';
import { AppError } from '../utils/app-error.js';
import { User, type IUser } from '../models/user.model.js';
import type {
  UserAvatarStorage,
  UserGender,
  UserProfileDto,
} from '../interfaces/user.ports.js';
import type { UploadedImageFile } from '../interfaces/identity-verification.ports.js';
import { FULL_NAME_PATTERN } from '../validations/auth.validation.js';

const GENDERS: readonly UserGender[] = ['female', 'male', 'other'];
const BIO_MAX_LENGTH = 200;
/** Trust Score mặc định khi chưa có đơn nào được chấm (R04 3.2 trust_score, GB-29) */
const DEFAULT_TRUST_SCORE = 100;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_BIRTH_DATE = Date.UTC(1900, 0, 1);

/** 'YYYY-MM-DD' → ngày (UTC) nếu là ngày có thật, từ 01/01/1900 đến hôm nay */
function parseDateOfBirth(value: string): Date | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (date.getTime() < EARLIEST_BIRTH_DATE || date.getTime() > Date.now()) return null;
  return date;
}

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
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
      gender: user.gender ?? null,
      bio: user.bio ?? null,
      trustScore: user.trust?.score ?? DEFAULT_TRUST_SCORE,
      // Ngày tạo tài khoản; thiếu createdAt thì lấy thời điểm trong _id
      memberSince: (user.createdAt ? new Date(user.createdAt) : user._id.getTimestamp()).toISOString(),
      verificationStatus: user.verificationStatus ?? 'unverified',
      role: user.role,
    };
    if (user.avatar) {
      dto.avatarUrl = user.avatar;
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

    // Địa chỉ giao nhận nay ở sổ địa chỉ (/users/addresses), không sửa qua hồ sơ
    const allowedKeys = new Set(['fullName', 'dateOfBirth', 'gender', 'bio']);
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
      if (typeof patch.fullName !== 'string' || !FULL_NAME_PATTERN.test(patch.fullName.trim())) {
        throw new AppError(
          400,
          'INVALID_INPUT',
          'Họ và tên chỉ gồm chữ cái và khoảng trắng, từ 2 đến 50 ký tự.',
        );
      }
      user.fullName = patch.fullName.trim();
    }

    if (patch.dateOfBirth !== undefined) {
      if (patch.dateOfBirth === null || patch.dateOfBirth === '') {
        user.dateOfBirth = undefined;
      } else {
        const date = typeof patch.dateOfBirth === 'string' ? parseDateOfBirth(patch.dateOfBirth) : null;
        if (!date) {
          throw new AppError(400, 'INVALID_INPUT', 'Ngày sinh không hợp lệ.');
        }
        user.dateOfBirth = date;
      }
    }

    if (patch.gender !== undefined) {
      if (patch.gender === null || patch.gender === '') {
        user.gender = undefined;
      } else if (typeof patch.gender === 'string' && (GENDERS as readonly string[]).includes(patch.gender)) {
        user.gender = patch.gender as UserGender;
      } else {
        throw new AppError(400, 'INVALID_INPUT', 'Giới tính chỉ là Nữ, Nam hoặc Khác.');
      }
    }

    if (patch.bio !== undefined) {
      if (patch.bio !== null && typeof patch.bio !== 'string') {
        throw new AppError(400, 'INVALID_INPUT', 'Giới thiệu phải là văn bản.');
      }
      const bio = (patch.bio ?? '').trim();
      if (bio.length > BIO_MAX_LENGTH) {
        throw new AppError(400, 'INVALID_INPUT', `Giới thiệu tối đa ${BIO_MAX_LENGTH} ký tự.`);
      }
      user.bio = bio || undefined;
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
