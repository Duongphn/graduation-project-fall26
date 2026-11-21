import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from './http-client'
import { getAccessToken } from './token-storage'

const assign = vi.fn()

beforeEach(() => {
  localStorage.setItem('toyflow-access-token', 'expired-access')
  localStorage.setItem('toyflow-refresh-token', 'revoked-refresh')
  vi.stubGlobal('location', { ...window.location, pathname: '/profile', search: '?tab=1', assign })
  // Mọi request API trả 401 (access token hết hạn)
  httpClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
      status: 401,
      statusText: 'Unauthorized',
      data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      headers: {},
      config: { ...config, headers: new AxiosHeaders() },
    })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  assign.mockReset()
})

describe('Phiên bị thu hồi (R03 V.2 MSG58)', () => {
  it('làm mới token thất bại → xoá phiên, về /login kèm trang cũ và lý do "phiên đã kết thúc"', async () => {
    // Server từ chối refresh token đã bị thu hồi
    vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST'))

    await expect(httpClient.get('/users/profile')).rejects.toBeInstanceOf(AxiosError)

    expect(getAccessToken()).toBeNull()
    expect(assign).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent('/profile?tab=1')}&reason=session-ended`)
  })
})
