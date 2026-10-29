import { normalizeSearchText } from './text.js';

interface SlugOptions {
  maxLength?: number;
  fallback?: string;
}

/** "Đồ chơi gỗ!" -> "do-choi-go". Returns the fallback when nothing usable is left. */
export const slugify = (
  value: string,
  { maxLength = 80, fallback = 'item' }: SlugOptions = {},
): string => {
  const slug = normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || fallback;
};

/**
 * The first free slug among `base`, `base-2`, `base-3`, ... according to `isTaken`. The unique
 * index stays the final guard against two concurrent writers.
 */
export const pickFreeSlug = async (
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
};
