import mongoose, { type Model } from 'mongoose';

import type { AddressDto } from '../interfaces/user.ports.js';
import { Address, type IAddress } from '../models/address.model.js';
import { User, type IUser } from '../models/user.model.js';
import { AppError } from '../utils/app-error.js';
import type { CreateAddressInput, UpdateAddressInput } from '../validations/address.validation.js';

const toDto = (address: IAddress): AddressDto => ({
  id: address._id.toString(),
  recipientName: address.recipientName,
  phone: address.phone,
  province: address.province,
  ward: address.ward,
  street: address.street,
  isDefault: address.isDefault,
});

/**
 * Sổ địa chỉ giao nhận (UC03, R03 III.6.1.1 (9)–(11), R04 3.26): nhiều địa chỉ, đúng một địa chỉ
 * mặc định. Địa chỉ đầu tiên tự thành mặc định; xoá là ẩn (status hidden).
 */
export class AddressService {
  public constructor(
    private readonly addressModel: Model<IAddress> = Address,
    private readonly userModel: Model<IUser> = User,
  ) {}

  /** Địa chỉ đang dùng: mặc định trước, rồi theo thứ tự thêm */
  public async list(userId: string): Promise<AddressDto[]> {
    await this.importLegacyAddress(userId);
    const addresses = await this.addressModel
      .find({ userId, status: 'active' })
      .sort({ isDefault: -1, createdAt: 1, _id: 1 });
    return addresses.map(toDto);
  }

  public async create(userId: string, input: CreateAddressInput): Promise<AddressDto> {
    await this.importLegacyAddress(userId);
    const hasAddress = await this.addressModel.exists({ userId, status: 'active' });
    // R03 (11): địa chỉ đầu tiên tự thành mặc định
    const isDefault = !hasAddress || input.isDefault === true;
    if (isDefault) await this.clearDefault(userId);

    const address = await this.addressModel.create({ ...input, userId, isDefault, status: 'active' });
    return toDto(address);
  }

  public async update(userId: string, addressId: string, input: UpdateAddressInput): Promise<AddressDto> {
    const address = await this.findOwned(userId, addressId);
    const { isDefault, ...fields } = input;

    // Bỏ tick ở địa chỉ mặc định không làm mất mặc định: luôn còn một địa chỉ mặc định
    if (isDefault === true && !address.isDefault) {
      await this.clearDefault(userId);
      address.isDefault = true;
    }
    Object.assign(address, fields);
    await address.save();
    return toDto(address);
  }

  /** Ẩn địa chỉ; nếu đó là địa chỉ mặc định thì địa chỉ được thêm sớm nhất còn lại thành mặc định */
  public async remove(userId: string, addressId: string): Promise<void> {
    const address = await this.findOwned(userId, addressId);
    const wasDefault = address.isDefault;
    address.status = 'hidden';
    address.isDefault = false;
    await address.save();

    if (wasDefault) {
      await this.addressModel.findOneAndUpdate(
        { userId, status: 'active' },
        { $set: { isDefault: true } },
        { sort: { createdAt: 1, _id: 1 } },
      );
    }
  }

  private async findOwned(userId: string, addressId: string) {
    const address = mongoose.Types.ObjectId.isValid(addressId)
      ? await this.addressModel.findOne({ _id: addressId, userId, status: 'active' })
      : null;
    if (!address) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Không tìm thấy địa chỉ.');
    }
    return address;
  }

  private async clearDefault(userId: string): Promise<void> {
    await this.addressModel.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
  }

  /**
   * Trước đây hồ sơ chỉ lưu một địa chỉ (users.address). Lần đầu mở sổ địa chỉ, địa chỉ đó được
   * chuyển thành địa chỉ mặc định (người nhận là chủ tài khoản) để người dùng không mất dữ liệu.
   */
  private async importLegacyAddress(userId: string): Promise<void> {
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, address: { $exists: true } },
      { $unset: { address: 1 } },
    );
    const legacy = user?.address;
    if (!user || !legacy || (await this.addressModel.exists({ userId }))) return;

    await this.addressModel.create({
      userId,
      recipientName: user.fullName,
      phone: user.phone,
      province: legacy.province,
      ward: legacy.district ? `${legacy.ward}, ${legacy.district}` : legacy.ward,
      street: legacy.street,
      isDefault: true,
      status: 'active',
    });
  }
}
