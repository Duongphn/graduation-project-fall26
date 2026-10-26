import { useSyncExternalStore } from 'react'
import { getAccessToken, subscribeAccessToken } from '../services/token-storage'

const getIsSignedIn = () => getAccessToken() !== null

/** Đã đăng nhập hay chưa — tự cập nhật khi token được lưu/xoá ở tab này hoặc tab khác */
export function useIsSignedIn(): boolean {
  return useSyncExternalStore(subscribeAccessToken, getIsSignedIn)
}
