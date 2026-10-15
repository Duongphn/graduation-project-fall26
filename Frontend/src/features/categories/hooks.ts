import { keepPreviousData, useIsMutating, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import type { WithMessage } from '../../types/api'
import { categoriesApi } from './api'
import type { CategoryListParams } from './types'

// Root key ['categories'] is shared with toy-listings' categoriesQuery (GET /categories), so every
// category change here also refreshes the post form's category list.
export const categoryKeys = {
  all: ['categories'] as const,
  adminList: (params: CategoryListParams) => [...categoryKeys.all, 'admin-list', params] as const,
  adminOptions: () => [...categoryKeys.all, 'admin-options'] as const,
}

export const useAdminCategories = (params: CategoryListParams) =>
  useQuery({
    queryKey: categoryKeys.adminList(params),
    queryFn: () => categoriesApi.listAdmin(params),
    placeholderData: keepPreviousData,
  })

// Options of Admin category filters (hidden ones included). Under categoryKeys.all, so creating,
// renaming or hiding a category refreshes every filter that uses it.
export const useAdminCategoryOptions = () =>
  useQuery({
    queryKey: categoryKeys.adminOptions(),
    queryFn: categoriesApi.adminOptions,
    staleTime: 300_000,
  })

// Every change refetches the category lists and toasts the backend message. The mutation stays
// pending until the refetch is done, so buttons stay disabled until the table is up to date.
// A 404/409/422 (another Admin changed the list) also refetches, next to the backend message.
// All share the mutation key categoryKeys.all: useIsMutating({ mutationKey }) sees any of them.
const useCategoryMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<WithMessage<TData>>,
  fallbackMessage: string,
  onError?: (error: unknown) => boolean,
) =>
  useApiMutation<WithMessage<TData>, TVariables>({
    mutationKey: categoryKeys.all,
    mutationFn,
    successMessage: (result) => result.message ?? fallbackMessage,
    invalidate: [categoryKeys.all],
    refetchOnStale: true,
    ...(onError ? { onError } : {}),
  })

// True while any category change (create, edit, hide, show, delete, reorder) is running.
export const useCategoryMutationPending = () =>
  useIsMutating({ mutationKey: categoryKeys.all }) > 0

export const useCreateCategory = (onError?: (error: unknown) => boolean) =>
  useCategoryMutation(categoriesApi.create, 'Đã thêm danh mục.', onError)
export const useUpdateCategory = (onError?: (error: unknown) => boolean) =>
  useCategoryMutation(categoriesApi.update, 'Đã cập nhật danh mục.', onError)
export const useHideCategory = () => useCategoryMutation(categoriesApi.hide, 'Đã ẩn danh mục.')
export const useShowCategory = () => useCategoryMutation(categoriesApi.show, 'Đã hiện danh mục.')
export const useDeleteCategory = () => useCategoryMutation(categoriesApi.remove, 'Đã xoá danh mục.')
export const useReorderCategories = () =>
  useCategoryMutation(categoriesApi.reorder, 'Đã cập nhật thứ tự.')
