import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { HomeCategory } from '../home-api'
import { homeCategoriesQuery } from '../home-queries'

/** Tra danh mục theo id (để thẻ đồ chơi hiện tên + icon danh mục) — dùng chung cache với section danh mục */
export function useCategoryLookup(): ReadonlyMap<string, HomeCategory> {
  const { data } = useQuery(homeCategoriesQuery)
  return useMemo(() => new Map(data?.map((category) => [category.id, category])), [data])
}
