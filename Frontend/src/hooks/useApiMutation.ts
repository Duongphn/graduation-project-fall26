import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MutationKey, QueryKey } from '@tanstack/react-query'
import { App } from 'antd'

import { ApiError, getErrorMessage } from '../services/api-error'

// Statuses after which the screen is probably out of date: 404 (someone else deleted the item),
// 409 (it changed or another Admin decided first), 422 (e.g. a reorder built from an old list).
export const STALE_ERROR_STATUSES: readonly number[] = [404, 409, 422]

interface ApiMutationOptions<TData, TVariables> {
  // Lets other components see the mutation with useIsMutating({ mutationKey }).
  mutationKey?: MutationKey
  mutationFn: (variables: TVariables) => Promise<TData>
  // Shown with message.success; a function receives the result.
  successMessage?: string | ((data: TData, variables: TVariables) => string)
  // Query keys to refetch after success, e.g. [categoryKeys.all].
  invalidate?: readonly QueryKey[]
  // Also refetch the `invalidate` keys after an error whose status is in STALE_ERROR_STATUSES
  // (true) or in the given list, so the screen shows the current state next to the message.
  refetchOnStale?: boolean | readonly number[]
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
  mutationKey,
  refetchOnStale = false,
  onSuccess,
  onError,
}: ApiMutationOptions<TData, TVariables>) => {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  return useMutation<TData, unknown, TVariables>({
    ...(mutationKey ? { mutationKey } : {}),
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
    // Like onSuccess, the mutation stays pending until the stale lists are refetched, so the
    // buttons stay disabled until the screen is up to date.
    onError: async (error, variables) => {
      if (onError?.(error, variables) !== true) message.error(getErrorMessage(error))
      const staleStatuses = refetchOnStale === true ? STALE_ERROR_STATUSES : refetchOnStale || []
      if (error instanceof ApiError && staleStatuses.includes(error.status)) {
        await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      }
    },
  })
}
