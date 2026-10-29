import { getAccessToken } from './token-storage'

export type CurrentRole = 'ADMIN' | 'USER'

// Reads the `role` claim of the stored access token. The token is only decoded for routing;
// the backend still checks every request.
export function getCurrentRole(): CurrentRole | null {
  const token = getAccessToken()
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const role = (JSON.parse(json) as { role?: unknown }).role
    return role === 'ADMIN' || role === 'USER' ? role : null
  } catch {
    return null
  }
}
