export const maskPhone = (phone: string) => `${phone.slice(0, 4)} *** ${phone.slice(-3)}`

export function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`
}
