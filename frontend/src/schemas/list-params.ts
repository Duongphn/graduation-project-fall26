import { z } from 'zod'

// Building blocks of the URL filter schemas given to useListParams. Every field falls back to
// undefined (or its own default) instead of throwing, so a hand-edited URL never breaks a page.

export const enumParam = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined)

// Search text (`q` on every list), trimmed; empty means no filter. Same 100-character limit as
// the backend searchQuerySchema.
export const searchParam = z
  .string()
  .trim()
  .max(100)
  .optional()
  .catch(undefined)
  .transform((value) => value || undefined)

export const objectIdParam = z
  .string()
  .regex(/^[a-f0-9]{24}$/i)
  .optional()
  .catch(undefined)
