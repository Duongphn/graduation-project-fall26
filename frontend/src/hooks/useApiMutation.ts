import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { App } from 'antd'

import { ApiError, getErrorMessage } from '../services/api-error'

interface ApiMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>
  // Shown with message.success; a function receives the result.
  successMessage?: string | ((data: TData, variables: TVariables) => string)
  // Query keys to refetch after success, e.g. [categoryKeys.all].
  invalidate?: readonly QueryKey[]
  // Also refetch the `invalidate` keys after a 409 (the item changed or another Admin decided
  // first), so the screen shows the current state next to the backend message.
  invalidateOnConflict?: boolean
  onSuccess?: (data: TData, variables: TVariables) => void
  // Return true when the error was handled (e.g. applied to form fields with
  // applyServerFieldErrors); otherwise the backend message is shown with message.error.
  onError?: (error: unknown, variables: TVariables) => boolean | void
}

// useMutation with the app's standard feedback: success message, cache invalidation and the
// backend error message. Every feature mutation goes through it.
export const useApiMutation = <TData = unknown, TVariables = void>({
  mutationFn,
  successMessage,
  invalidate = [],
  invalidateOnConflict = false,
  onSuccess,
  onError,
}: ApiMutationOptions<TData, TVariables>) => {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: async (data, variables) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      if (successMessage) {
        message.success(
          typeof successMessage === 'function' ? successMessage(data, variables) : successMessage,
        )
      }
      onSuccess?.(data, variables)
    },
    onError: (error, variables) => {
      if (invalidateOnConflict && error instanceof ApiError && error.status === 409) {
        for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey })
      }
      if (onError?.(error, variables) === true) return
      message.error(getErrorMessage(error))
    },
  })
}
