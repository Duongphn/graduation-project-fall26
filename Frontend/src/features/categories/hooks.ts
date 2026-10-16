import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import type { WithMessage } from '../../types/api'
import { categoriesApi } from './api'
import type { CategoryListParams } from './types'

export const categoryKeys = {
  all: ['categories'] as const,
  adminList: (params: CategoryListParams) => [...categoryKeys.all, 'admin-list', params] as const,
  adminOptions: () => [...categoryKeys.all, 'admin-options'] as const,
  publicList: () => [...categoryKeys.all, 'public'] as const,
}

export const useAdminCategories = (params: CategoryListParams) =>
  useQuery({
    queryKey: categoryKeys.adminList(params),
    queryFn: () => categoriesApi.listAdmin(params),
    placeholderData: keepPreviousData,
  })

// For post forms and search filters in other features.
export const usePublicCategories = () =>
  useQuery({
    queryKey: categoryKeys.publicList(),
    queryFn: categoriesApi.listPublic,
    staleTime: 300_000,
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
const useCategoryMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<WithMessage<TData>>,
  fallbackMessage: string,
  onError?: (error: unknown) => boolean,
) =>
  useApiMutation<WithMessage<TData>, TVariables>({
    mutationFn,
    successMessage: (result) => result.message ?? fallbackMessage,
    invalidate: [categoryKeys.all],
    ...(onError ? { onError } : {}),
  })

export const useCreateCategory = (onError?: (error: unknown) => boolean) =>
  useCategoryMutation(categoriesApi.create, 'Đã thêm danh mục.', onError)
export const useUpdateCategory = (onError?: (error: unknown) => boolean) =>
  useCategoryMutation(categoriesApi.update, 'Đã cập nhật danh mục.', onError)
export const useHideCategory = () => useCategoryMutation(categoriesApi.hide, 'Đã ẩn danh mục.')
export const useShowCategory = () => useCategoryMutation(categoriesApi.show, 'Đã hiện danh mục.')
export const useDeleteCategory = () => useCategoryMutation(categoriesApi.remove, 'Đã xoá danh mục.')
export const useReorderCategories = () =>
  useCategoryMutation(categoriesApi.reorder, 'Đã cập nhật thứ tự.')
