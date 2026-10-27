// Vietnamese mobile numbers. Stored in E.164 form (+84 and 9 digits), masked in lists (GB-35).

/** "0912 345 678", "84912345678" or "+84912345678" -> "+84912345678"; otherwise undefined. */
export const normalizeVietnamPhone = (value: string): string | undefined => {
  const compact = value.replace(/[\s.\-()]/g, '');
  const match = /^(?:\+84|84|0)([1-9]\d{8})$/.exec(compact);
  return match ? `+84${match[1]}` : undefined;
};

/** "+84912345678" -> "+8491***5678". Anything that is not a phone number becomes "***". */
export const maskPhone = (phone: string | null | undefined): string => {
  const normalized = phone ? normalizeVietnamPhone(phone) : undefined;
  if (!normalized) return '***';
  return `${normalized.slice(0, 5)}***${normalized.slice(-4)}`;
};

/**
 * The digits to look for in stored numbers: "0912345678" -> "912345678", "0912" -> "912".
 * Build the query with escapeRegex from text.ts.
 */
export const phoneSearchDigits = (search: string): string => {
  const normalized = normalizeVietnamPhone(search);
  if (normalized) return normalized.slice(3);
  return search.replace(/\D/g, '').replace(/^(?:84|0)/, '');
};
