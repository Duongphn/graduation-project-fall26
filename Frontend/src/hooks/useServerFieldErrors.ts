import { useCallback } from 'react'
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'

import { applyServerFieldErrors } from '../utils/form-errors'

// Returns an onError for useApiMutation that puts the backend field errors on the form:
// useApiMutation({ ..., onError: useServerFieldErrors(setError) }).
export const useServerFieldErrors = <TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  fieldMap?: Record<string, FieldPath<TValues>>,
) =>
  useCallback(
    (error: unknown) => applyServerFieldErrors(error, setError, fieldMap),
    [setError, fieldMap],
  )
