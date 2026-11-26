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

// A digit group: digits with at most one space, dot or dash between them, e.g. "0912 345 678",
// "091.234.5678". A phone may also be split into groups with wider gaps ("0912  345  678",
// "0912 - 345 - 678"); see scanDigitRuns.
const DIGIT_GROUP = /\+?\d(?:[\s.-]?\d)*/g;
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

// Groups joined by a wider gap only count as a phone when they follow the numbering plan
// (mobile 03/05/07/08/09 + 8 digits, landline 02 + 9 digits), start like a phone ("0…", "+84…",
// "84") and hold no date or time ("18-11-2026", "08.30"), so prices and dates stay readable.
const GAP = /^[\s.-]+$/;
const GAPPED_PHONE_DIGITS = /^(?:0|84)(?:[35789]\d{8}|2\d{9})$/;
const DATE_OR_TIME = /^(?:\d{1,2}[.-]\d{1,2}(?:[.-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})$/;
const MAX_PHONE_DIGITS = 12;

const onlyDigits = (value: string): string => value.replace(/\D/g, '');

interface DigitRun {
  start: number;
  end: number;
  text: string;
  phone: boolean;
}

/** Index of the last group of the phone number that starts at groups[first], or -1. */
const phoneEnd = (text: string, groups: DigitRun[], first: number): number => {
  const head = groups[first]!;
  if (PHONE_DIGITS.test(onlyDigits(head.text))) return first;
  const startsLikePhone = /^[0+]/.test(head.text) || head.text === '84';
  if (!startsLikePhone || DATE_OR_TIME.test(head.text)) return -1;

  let digits = onlyDigits(head.text);
  let last = -1;
  for (let next = first + 1; next < groups.length; next += 1) {
    const group = groups[next]!;
    const gap = text.slice(groups[next - 1]!.end, group.start);
    if (!GAP.test(gap) || DATE_OR_TIME.test(group.text)) break;
    digits += onlyDigits(group.text);
    if (digits.length > MAX_PHONE_DIGITS) break;
    if (GAPPED_PHONE_DIGITS.test(digits)) last = next;
  }
  return last;
};

/** Splits the text into digit runs; a phone number written in several groups is one run. */
const scanDigitRuns = (text: string): DigitRun[] => {
  const groups = [...text.matchAll(DIGIT_GROUP)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
    phone: false,
  }));
  const runs: DigitRun[] = [];
  for (let index = 0; index < groups.length; ) {
    const last = phoneEnd(text, groups, index);
    if (last < 0) {
      runs.push(groups[index]!);
      index += 1;
    } else {
      const start = groups[index]!.start;
      const end = groups[last]!.end;
      runs.push({ start, end, text: text.slice(start, end), phone: true });
      index = last + 1;
    }
  }
  return runs;
};

// 9-19 digits without dots: a bank account number (prices use dots: "15.000.000").
const isBankAccount = (run: DigitRun): boolean =>
  !run.phone && !run.text.includes('.') && /^\d{9,19}$/.test(onlyDigits(run.text));

const hasPhoneNumber = (text: string): boolean => scanDigitRuns(text).some((run) => run.phone);

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

  for (const run of scanDigitRuns(text)) {
    if (run.phone) phone = true;
    else if (isBankAccount(run)) bankAccount = true;
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
  let result = '';
  let cursor = 0;
  for (const run of scanDigitRuns(masked)) {
    const kind = run.phone ? 'PHONE' : isBankAccount(run) ? 'BANK_ACCOUNT' : undefined;
    if (!kind) continue;
    kinds.add(kind);
    result += masked.slice(cursor, run.start) + CONTACT_MASK;
    cursor = run.end;
  }
  return { text: result + masked.slice(cursor), kinds: [...kinds] };
};
