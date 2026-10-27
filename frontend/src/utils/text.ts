// "Hồ Chí Minh" -> "ho chi minh": compare text without Vietnamese accents or case.
export const withoutTones = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

// Client-side search for antd Select/AutoComplete: true when `label` contains `input`.
export const matchesWithoutTones = (input: string, label: unknown): boolean =>
  withoutTones(String(label ?? '')).includes(withoutTones(input))
