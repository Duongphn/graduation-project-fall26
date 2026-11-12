import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../../services/http-client'
import { renderWithProviders } from '../../../test/render'
import type { ToyAdviceDTO } from '../ai-chat-api'
import { AdvisorFloatingChat } from './advisor-floating-chat'

const renderChat = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/toys?type=rent']}>
      <AdvisorFloatingChat />
    </MemoryRouter>,
  )

const answer: ToyAdviceDTO = {
  advice: 'Mình gợi ý món này nhé.',
  listings: [
    {
      id: '66a000000000000000000001',
      name: 'Bộ xếp hình gỗ',
      listingType: 'rent',
      priceOrRate: 40_000,
      condition: 'Tốt',
      image: '',
      reason: 'Hợp tuổi.',
    },
  ],
  filters: { ageYears: 4, category: 'any', listingType: 'rent', maxPrice: null, area: '' },
  source: 'ai',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AdvisorFloatingChat', () => {
  it('shows only the floating button until it is opened', async () => {
    renderChat()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI Robo tư vấn đồ chơi' }))

    expect(screen.getByRole('dialog', { name: 'Trợ lý AI Robo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nhập câu hỏi cho trợ lý AI')).toHaveFocus()
  })

  it('closes with Escape and gives focus back to the button', async () => {
    renderChat()
    const toggle = screen.getByRole('button', { name: 'Mở trợ lý AI Robo tư vấn đồ chơi' })
    await userEvent.click(toggle)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })

  it('sends the question to the advisor API and shows the suggested toys', async () => {
    const post = vi.spyOn(httpClient, 'post').mockResolvedValueOnce({ data: { success: true, data: answer } })
    renderChat()
    await userEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI Robo tư vấn đồ chơi' }))

    await userEvent.type(screen.getByLabelText('Nhập câu hỏi cho trợ lý AI'), 'Bé 4 tuổi thích xếp hình{Enter}')

    expect(post).toHaveBeenCalledWith(
      '/ai/toy-advice',
      expect.objectContaining({ message: 'Bé 4 tuổi thích xếp hình' }),
      expect.anything(),
    )
    await waitFor(() => expect(screen.getByText('Mình gợi ý món này nhé.')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Bộ xếp hình gỗ/ })).toHaveAttribute(
      'href',
      '/toys/66a000000000000000000001',
    )
  })

  it('asks a guest to sign in and comes back to the same list', async () => {
    renderChat()
    await userEvent.click(screen.getByRole('button', { name: 'Mở trợ lý AI Robo tư vấn đồ chơi' }))

    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/toys?type=rent')}`,
    )
  })
})
