import type { MaskedContactKind } from '../constants/chat.js';
import { normalizeSearchText, normalizeText } from './text.js';

// Contact details in the title or description of a post (R03 GB-11, MSG22). Two tiers:
// - strong: a Vietnamese phone number, an email address, or a link starting with http(s):// or
//   www. Saving a rent, sale or donation post with one of these is refused
//   (CONTACT_DETAILS_NOT_ALLOWED).
// - weak: bank or e-wallet names, chat-app names, long digit runs, bare domains such as
//   "tobot.vn". They catch honest toy text ("đồ chơi ngân hàng", "Gấu bông Momo", a barcode), so
//   they only become warnings for the Admin on the moderation screen and never block a save.
// The web form mirrors the strong tier in features/toy-listings/contact-details.ts.

// Digits with at most one space, dot or dash between them, e.g. "0912 345 678", "091.234.5678".
const DIGIT_RUN = /\+?\d(?:[\s.-]?\d){7,}/g;
// Vietnamese mobile (0 + 9 digits) or landline (0 + 10 digits), with or without the 84 prefix.
const PHONE_DIGITS = /^(?:0|84)\d{9,10}$/;
// An email address: "be.na@gmail.com".
const EMAIL = /[\p{L}\p{N}._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/iu;
// A link written as a link: "https://…", "http://…" or "www.…" (not inside a word: "awww.").
const URL_LINK = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)\S/iu;

const BANK_KEYWORDS =
  /\b(?:stk|so tai khoan|chuyen khoan|ngan hang|vietcombank|vietinbank|techcombank|agribank|bidv|mbbank|mb bank|tpbank|vpbank|sacombank|acb|momo)\b/;
// Vietnamese words such as "co", "me" and "ly" are not listed as domains: "tot.Co pin" is text.
const LINK =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]+\.(?:com|net|org|vn|info|biz|io|shop|store|online|site|xyz|link)\b/;
const EXTERNAL_CHANNELS = /\b(?:zalo|facebook|fb|messenger|telegram|instagram|tiktok)\b/;

const hasPhoneNumber = (text: string): boolean => {
  for (const match of text.matchAll(DIGIT_RUN)) {
    if (PHONE_DIGITS.test(match[0].replace(/\D/g, ''))) return true;
  }
  return false;
};

export interface BlockedContactFindings {
  phone: boolean;
  email: boolean;
  link: boolean;
}

/** The strong tier: what makes a save fail with CONTACT_DETAILS_NOT_ALLOWED. */
export const findBlockedContactDetails = (text: string): BlockedContactFindings => {
  const value = normalizeText(text);
  return {
    phone: hasPhoneNumber(value),
    email: EMAIL.test(value),
    link: URL_LINK.test(value),
  };
};

/** True when the text holds a phone number, an email address or an http(s)/www link. */
export const hasBlockedContactDetails = (text: string): boolean =>
  Object.values(findBlockedContactDetails(text)).some(Boolean);

export interface ContactFindings {
  phone: boolean;
  bankAccount: boolean;
  link: boolean;
}

/** Both tiers, for the Admin warnings (CONTACT_PHONE, CONTACT_BANK_ACCOUNT, CONTACT_LINK). */
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

// ---- Chat masking (UC25, GB-11, MSG41) ----
// Chat messages are not refused: the same fixed patterns hide the contact details before the
// message is stored, so neither side (nor a later reader) ever sees them. Bank account numbers
// (digit runs of 9-19 digits that are not a phone number and have no dots) are hidden too.

export type { MaskedContactKind };

/** What replaces each hidden contact detail in a chat message. */
export const CONTACT_MASK = '***';

export interface MaskedText {
  text: string;
  /** The kinds of contact details that were hidden, without duplicates; empty when none. */
  kinds: MaskedContactKind[];
}

// Global copies of the patterns above, for replacing every match of a message.
const EMAIL_ALL = new RegExp(EMAIL.source, 'giu');
const LINK_ALL = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)\S+/giu;
const LINK_TRAILING_PUNCTUATION = /[.,;:!?)\]}'"…]+$/u;

/** Hides phone numbers, email addresses, http(s)/www links and bank account numbers. */
export const maskContactDetails = (text: string): MaskedText => {
  const kinds = new Set<MaskedContactKind>();
  // Links first ("https://zalo.me/0912345678" is one link), then emails, then digit runs.
  // Punctuation that ends the sentence stays: "xem https://x.vn/a, nhé" -> "xem ***, nhé".
  let masked = text.replace(LINK_ALL, (link) => {
    kinds.add('LINK');
    return CONTACT_MASK + (LINK_TRAILING_PUNCTUATION.exec(link)?.[0] ?? '');
  });
  masked = masked.replace(EMAIL_ALL, () => {
    kinds.add('EMAIL');
    return CONTACT_MASK;
  });
  masked = masked.replace(DIGIT_RUN, (run) => {
    const digits = run.replace(/\D/g, '');
    if (PHONE_DIGITS.test(digits)) {
      kinds.add('PHONE');
      return CONTACT_MASK;
    }
    if (!run.includes('.') && /^\d{9,19}$/.test(digits)) {
      kinds.add('BANK_ACCOUNT');
      return CONTACT_MASK;
    }
    return run;
  });
  return { text: masked, kinds: [...kinds] };
};
