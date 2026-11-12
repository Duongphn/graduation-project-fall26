import { act, waitFor } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../../services/http-client'
import { deferred, renderHookWithProviders } from '../../../test/render'
import type { AdvisorFilters, AdvisorRequest, AdvisorResponse } from '../ai-chat-api'
import { useAdvisorChat } from './use-advisor-chat'

const FILTERS: AdvisorFilters = {
  ageYears: 4,
  category: 'lap-rap-xep-hinh',
  listingType: 'rent',
  maxPrice: 150_000,
  area: '',
}

const answer = (reply: string, filters = FILTERS): AdvisorResponse => ({
  reply,
  toys: [
    {
      id: '66a000000000000000000001',
      name: 'Bộ xếp hình',
      listingType: 'rent',
      priceOrRate: 40_000,
      condition: 'Tốt',
      image: '',
      reason: 'Hợp tuổi.',
    },
  ],
  filters,
  source: 'ai',
})

const ok = (data: AdvisorResponse) => ({ data: { success: true, data } })

const sentPayloads = (post: { mock: { calls: unknown[][] } }) =>
  post.mock.calls.map((call) => call[1] as AdvisorRequest)

describe('useAdvisorChat', () => {
  it('sends only the 2 latest messages and sends back the filters from the server', async () => {
    const post = vi
      .spyOn(httpClient, 'post')
      .mockResolvedValueOnce(ok(answer('x'.repeat(400))))
      .mockResolvedValueOnce(ok(answer('Món rẻ hơn đây.', { ...FILTERS, maxPrice: 100_000 })))
      .mockResolvedValueOnce(ok(answer('Ok.')))
    const { result } = renderHookWithProviders(() => useAdvisorChat())

    act(() => result.current.send('Bé 4 tuổi thích xếp hình'))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    act(() => result.current.send('rẻ hơn được không'))
    await waitFor(() => expect(result.current.messages).toHaveLength(4))
    act(() => result.current.send('còn món nào khác không'))
    await waitFor(() => expect(result.current.messages).toHaveLength(6))

    const [first, second, third] = sentPayloads(post)
    expect(first).toMatchObject({
      message: 'Bé 4 tuổi thích xếp hình',
      history: [],
      filtersFromButtons: false,
    })
    expect(first?.filters).toBeUndefined()
    expect(second?.filters).toEqual(FILTERS)
    expect(second?.history).toEqual([
      { role: 'user', text: 'Bé 4 tuổi thích xếp hình' },
      { role: 'assistant', text: 'x'.repeat(300) },
    ])
    expect(third?.filters?.maxPrice).toBe(100_000)
    expect(third?.history.map((item) => item.text)).toEqual(['rẻ hơn được không', 'Món rẻ hơn đây.'])
    expect(result.current.messages[1]?.toys).toHaveLength(1)
  })

  it('sends button filters with filtersFromButtons and shows them as the parent message', async () => {
    const post = vi.spyOn(httpClient, 'post').mockResolvedValueOnce(ok(answer('Gợi ý theo bộ lọc.')))
    const { result } = renderHookWithProviders(() => useAdvisorChat())

    act(() => result.current.applyFilters(FILTERS, 'Lọc: 4 tuổi · Thuê'))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    expect(sentPayloads(post)[0]).toMatchObject({
      message: '',
      filters: FILTERS,
      filtersFromButtons: true,
    })
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      text: 'Lọc: 4 tuổi · Thuê',
    })
  })

  it('shows the daily limit message and never sends error messages as history', async () => {
    const limit = new AxiosError('Too Many Requests', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 429,
      data: {
        error: {
          code: 'AI_DAILY_LIMIT',
          message: 'Bạn đã dùng hết 20 lượt hỏi trợ lý AI hôm nay.',
        },
      },
    } as AxiosResponse)
    const post = vi
      .spyOn(httpClient, 'post')
      .mockRejectedValueOnce(limit)
      .mockResolvedValueOnce(ok(answer('Ok.')))
    const { result } = renderHookWithProviders(() => useAdvisorChat())

    act(() => result.current.send('Bé 4 tuổi chơi gì?'))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[1]).toMatchObject({
      isError: true,
      text: 'Bạn đã dùng hết 20 lượt hỏi trợ lý AI hôm nay.',
    })

    act(() => result.current.send('Thử lại'))
    await waitFor(() => expect(result.current.messages).toHaveLength(4))
    expect(sentPayloads(post)[1]?.history).toEqual([{ role: 'user', text: 'Bé 4 tuổi chơi gì?' }])
  })

  it('ignores a late answer after starting over', async () => {
    const pending = deferred<ReturnType<typeof ok>>()
    vi.spyOn(httpClient, 'post').mockReturnValueOnce(pending.promise)
    const { result } = renderHookWithProviders(() => useAdvisorChat())

    act(() => result.current.send('Bé 4 tuổi chơi gì?'))
    act(() => result.current.reset())
    await act(async () => pending.resolve(ok(answer('Trả lời muộn.'))))

    expect(result.current.messages).toEqual([])
    expect(result.current.filters).toBeUndefined()
  })
})
