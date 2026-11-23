// Vietnamese text helpers shared by search, slugs and duplicate checks.

/** NFC form, single spaces, trimmed: "  Bé   Na " -> "Bé Na". */
export const normalizeText = (value: string): string =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Removes Vietnamese tone and vowel marks: "Đồ chơi" -> "Do choi". */
export const stripAccents = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/** Lower case, no accents, single spaces: the form used to compare search text. */
export const normalizeSearchText = (value: string): string =>
  stripAccents(normalizeText(value)).toLowerCase();

/** Escapes every RegExp metacharacter so user input matches literally. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const letterVariants: Record<string, string> = {
  a: 'aàáảãạăằắẳẵặâầấẩẫậ',
  e: 'eèéẻẽẹêềếểễệ',
  i: 'iìíỉĩị',
  o: 'oòóỏõọôồốổỗộơờớởỡợ',
  u: 'uùúủũụưừứửữự',
  y: 'yỳýỷỹỵ',
  d: 'dđ',
};

/**
 * A RegExp source that matches `search` with or without Vietnamese accents, in any case and
 * with any run of spaces: "ha noi" matches "Hà Nội". Use it with the "i" option, e.g.
 * `{ name: { $regex: accentInsensitivePattern(search), $options: 'i' } }`.
 */
export const accentInsensitivePattern = (search: string): string =>
  [...normalizeSearchText(search)]
    .map((char) => {
      if (char === ' ') return '\\s+';
      const variants = letterVariants[char];
      return variants ? `[${variants}${variants.toUpperCase()}]` : escapeRegex(char);
    })
    .join('');

/** What people put before a province name or leave out: "TP.", "Thành phố", "Tỉnh". */
const PROVINCE_PREFIX = /^(?:tp\.?|thanh pho|tinh)\s*/;

/**
 * A RegExp source that matches a stored province name the way people type it: accents, case
 * and runs of spaces are ignored, and so is a "TP."/"Thành phố"/"Tỉnh" prefix on either side,
 * so "ho chi minh" matches "TP. Hồ Chí Minh" and "Thành phố Hồ Chí Minh". Use it with "i".
 */
export const provinceNamePattern = (province: string): string => {
  const typed = normalizeSearchText(province);
  const name = typed.replace(PROVINCE_PREFIX, '') || typed;
  const prefixes = [
    'tp\\.?',
    accentInsensitivePattern('thanh pho'),
    accentInsensitivePattern('tinh'),
  ];
  return `^(?:(?:${prefixes.join('|')})\\s*)?${accentInsensitivePattern(name)}$`;
};
