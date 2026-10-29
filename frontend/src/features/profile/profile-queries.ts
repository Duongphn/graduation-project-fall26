import { queryOptions } from '@tanstack/react-query'
import { fetchLatestVerification, fetchProfile } from './profile-api'

/** Cùng một khai báo cho loader (tải trước) và useQuery trong trang (đọc cache) để không gọi API hai lần */

export const profileQuery = queryOptions({
  queryKey: ['profile'],
  queryFn: fetchProfile,
  staleTime: 60_000,
  retry: false,
})

export const latestVerificationQuery = queryOptions({
  queryKey: ['identity-verification', 'latest'],
  queryFn: fetchLatestVerification,
  staleTime: 60_000,
  retry: false,
})
