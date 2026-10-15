import { getAccessToken } from './token-storage'

// Role of the signed-in user, read from the access token payload (`role` claim). The token is
// only decoded, not verified: this decides what the UI shows, the backend still checks every call.
const roleFromToken = (token: string): string | undefined => {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const role: unknown = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : undefined
  } catch {
    return undefined
  }
}

// Signed-in role, or in development the VITE_DEV_ROLE of the dev-auth user (VITE_DEV_USER_ID).
export const getCurrentRole = (): string | undefined => {
  const token = getAccessToken()
  if (token) return roleFromToken(token)
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_USER_ID) {
    return import.meta.env.VITE_DEV_ROLE ?? 'USER'
  }
  return undefined
}

