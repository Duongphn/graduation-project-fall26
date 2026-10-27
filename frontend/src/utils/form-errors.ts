import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'

import { ApiError } from '../services/api-error'

// Copies the backend field errors (VALIDATION_ERROR details) onto react-hook-form fields.
// `fieldMap` renames server fields, e.g. { 'contact.phone': 'phone' }. Returns true when at
// least one field error was applied, so the caller can skip the generic message.
export const applyServerFieldErrors = <TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  fieldMap: Record<string, FieldPath<TValues>> = {},
): boolean => {
  if (!(error instanceof ApiError)) return false
  let applied = false
  for (const detail of error.fieldErrors) {
    const field = fieldMap[detail.field] ?? (detail.field as FieldPath<TValues>)
    setError(field, { type: 'server', message: detail.message })
    applied = true
  }
  return applied
}
