// Masking of personal data in lists, logs and emails (GB-35). Phones: maskPhone in phone.ts.

/** "nguyen.an@gmail.com" -> "ng***@gmail.com". Anything that is not an address -> "***". */
export const maskEmail = (address: string | null | undefined): string => {
  if (!address) return '***';
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = address.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length - 1))}***${address.slice(at)}`;
};
