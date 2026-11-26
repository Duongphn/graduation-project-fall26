import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getApiErrorMessage, httpClient, REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE, wakeServer } from './http-client'
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

describe('http client and a sleeping API (Render free plan wakes up in 30-50 s)', () => {
  it('waits up to 60 s for an answer', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(60_000)
    expect(httpClient.defaults.timeout).toBe(60_000)
  })

  it('says the server is slow, not that the network is down, when a request times out', () => {
    expect(getApiErrorMessage(new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED'))).toBe(TIMEOUT_MESSAGE)
    expect(getApiErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.',
    )
  })

  it('pings /health once to wake the API when the app opens', () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { status: 'ok' } })
    wakeServer()
    wakeServer()
    expect(get).toHaveBeenCalledTimes(1)
    expect(String(get.mock.calls[0][0])).toMatch(/\/health$/)
    get.mockRestore()
  })
})
