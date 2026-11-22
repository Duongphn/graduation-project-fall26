import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useApiMutation } from '../../hooks/useApiMutation'
import type { WithMessage } from '../../types/api'
import { categoriesQuery } from '../toy-listings/toy-listing-queries'
import { organizationsApi } from './api'
import type { OrganizationInput, OrganizationListParams } from './types'

export const organizationKeys = {
  all: ['organizations'] as const,
  list: (params: OrganizationListParams) => [...organizationKeys.all, 'list', params] as const,
  detail: (id: string) => [...organizationKeys.all, 'detail', id] as const,
}

export const useOrganizations = (params: OrganizationListParams) =>
  useQuery({
    queryKey: organizationKeys.list(params),
    queryFn: () => organizationsApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useOrganization = (id: string | undefined) =>
  useQuery({
    queryKey: organizationKeys.detail(id ?? ''),
    queryFn: () => organizationsApi.get(id ?? ''),
    enabled: Boolean(id),
  })

// The backend message when it sends one, else the fallback.
const messageOr =
  (fallback: string) =>
  <T>(result: WithMessage<T>) =>
    result.message ?? fallback
const invalidate = [organizationKeys.all]

export const useCreateOrganization = (onError?: (error: unknown) => boolean) =>
  useApiMutation({
    mutationFn: (input: OrganizationInput) => organizationsApi.create(input),
    successMessage: messageOr('Đã thêm tổ chức.'),
    invalidate,
    onError,
  })

export const useUpdateOrganization = (onError?: (error: unknown) => boolean) =>
  useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<OrganizationInput> }) =>
      organizationsApi.update(id, input),
    successMessage: messageOr('Đã cập nhật.'),
    invalidate,
    onError,
  })

export const useHideOrganization = () =>
  useApiMutation({
    mutationFn: organizationsApi.hide,
    successMessage: messageOr('Đã ẩn tổ chức.'),
    invalidate,
  })

export const useShowOrganization = () =>
  useApiMutation({
    mutationFn: organizationsApi.show,
    successMessage: messageOr('Đã hiện tổ chức.'),
    invalidate,
  })

export const useDeleteOrganization = () =>
  useApiMutation({
    mutationFn: organizationsApi.remove,
    successMessage: messageOr('Đã xoá tổ chức.'),
    invalidate,
  })

/** Tên các danh mục đang hoạt động theo id (GET /categories), để hiện danh mục tổ chức nhận (GB-53) */
export function useCategoryNames(): ReadonlyMap<string, string> {
  const categories = useQuery(categoriesQuery)
  return useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category.name])),
    [categories.data],
  )
}
