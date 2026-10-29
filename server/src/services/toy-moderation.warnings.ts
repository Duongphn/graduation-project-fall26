import { normalizeSearchText } from '../utils/text.js';
import type { ModerationListingType, ModerationWarning } from '../validations/toy-moderation.validation.js';

type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

// Rule-based warnings shown next to a post. They only help the Admin; they never approve or
// reject anything by themselves (LI-03).

// ---- Contact details in the text of a post (GB-11) ----

// Digits with at most one space, dot or dash between them, e.g. "0912 345 678", "091.234.5678".
const DIGIT_RUN = /\+?\d(?:[\s.-]?\d){7,}/g;
// Vietnamese mobile (0 + 9 digits) or landline (0 + 10 digits), with or without the 84 prefix.
const PHONE_DIGITS = /^(?:0|84)\d{9,10}$/;
const BANK_KEYWORDS =
  /\b(?:stk|so tai khoan|chuyen khoan|ngan hang|vietcombank|vietinbank|techcombank|agribank|bidv|mbbank|mb bank|tpbank|vpbank|sacombank|acb|momo)\b/;
// Vietnamese words such as "co", "me" and "ly" are not listed as domains: "tot.Co pin" is text.
const LINK =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]+\.(?:com|net|org|vn|info|biz|io|shop|store|online|site|xyz|link)\b/;
const EXTERNAL_CHANNELS = /\b(?:zalo|facebook|fb|messenger|telegram|instagram|tiktok)\b/;

export interface ContactFindings {
  phone: boolean;
  bankAccount: boolean;
  link: boolean;
}

export const findContactDetails = (text: string): ContactFindings => {
  const normalized = normalizeSearchText(text);
  let phone = false;
  let bankAccount = BANK_KEYWORDS.test(normalized);

  for (const match of text.matchAll(DIGIT_RUN)) {
    const run = match[0];
    const digits = run.replace(/\D/g, '');
    if (PHONE_DIGITS.test(digits)) {
      phone = true;
    } else if (!run.includes('.') && /^\d{9,19}$/.test(digits)) {
      // Prices use dots between thousands ("15.000.000"), so a run with dots is not an account.
      bankAccount = true;
    }
  }

  return {
    phone,
    bankAccount,
    link: LINK.test(normalized) || EXTERNAL_CHANNELS.test(normalized),
  };
};

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
