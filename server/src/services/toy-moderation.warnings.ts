import { findContactDetails } from '../utils/contact-details.js';
import type { ModerationListingType, ModerationWarning } from '../validations/toy-moderation.validation.js';

type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

// Rule-based warnings shown next to a post. They only help the Admin; they never approve or
// reject anything by themselves (LI-03).

// ---- Contact details in the text of a post (GB-11) ----
// Both tiers become warnings here. The strong tier (phone, email, http/www link) also blocks the
// save of a post (utils/contact-details.ts); the weak tier is only a hint for the Admin.
export { findContactDetails, type ContactFindings } from '../utils/contact-details.js';

// ---- Warnings for the Admin ----

const listingTypeLabels: Record<ModerationListingType, string> = {
  rent: 'cho thuê',
  sell: 'bán',
  donate: 'tặng',
};

const identityLabels: Record<Exclude<VerificationStatus, 'verified'>, string> = {
  unverified: 'chưa gửi yêu cầu xác minh',
  pending: 'đang chờ Admin xác minh',
  rejected: 'yêu cầu xác minh bị từ chối',
};

export interface WarningInput {
  listingType: ModerationListingType;
  imageCount: number;
  minPhotos: number;
  text: string;
  category: { name: string; status: 'active' | 'hidden' } | null;
  owner: { verificationStatus: VerificationStatus; locked: boolean } | null;
}

export const buildModerationWarnings = (input: WarningInput): ModerationWarning[] => {
  const warnings: ModerationWarning[] = [];
  const add = (code: ModerationWarning['code'], message: string) => {
    warnings.push({ code, message });
  };

  if (!input.category) {
    add('CATEGORY_MISSING', 'Không tìm thấy danh mục của tin đăng.');
  } else if (input.category.status === 'hidden') {
    add(
      'CATEGORY_HIDDEN',
      `Danh mục "${input.category.name}" đang bị ẩn (bị cấm hoặc không phù hợp): không thể duyệt tin này.`,
    );
  }

  const owner = input.owner;
  if (!owner) {
    add('OWNER_MISSING', 'Không tìm thấy tài khoản người đăng.');
  } else {
    if (owner.verificationStatus !== 'verified') {
      add(
        'OWNER_UNVERIFIED',
        `Người đăng chưa xác minh danh tính (${identityLabels[owner.verificationStatus]}).`,
      );
    }
    if (owner.locked) add('OWNER_LOCKED', 'Tài khoản người đăng đang bị khoá.');
  }

  if (input.imageCount < input.minPhotos) {
    add(
      'TOO_FEW_PHOTOS',
      `Tin ${listingTypeLabels[input.listingType]} cần ít nhất ${input.minPhotos} ảnh, tin này chỉ có ${input.imageCount} ảnh.`,
    );
  }

  const contact = findContactDetails(input.text);
  if (contact.phone) add('CONTACT_PHONE', 'Tiêu đề hoặc mô tả có số điện thoại (GB-11).');
  if (contact.bankAccount) {
    add(
      'CONTACT_BANK_ACCOUNT',
      'Tiêu đề hoặc mô tả có số tài khoản hoặc thông tin chuyển khoản (GB-11).',
    );
  }
  if (contact.link) {
    add(
      'CONTACT_LINK',
      'Tiêu đề hoặc mô tả có đường link hoặc kênh liên hệ ngoài nền tảng (GB-11).',
    );
  }

  return warnings;
};
