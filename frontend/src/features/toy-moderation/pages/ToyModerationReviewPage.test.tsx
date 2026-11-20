import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { toyModerationApi } from '../api'
import { safetyChecklistItems } from '../constants'
import type { ToyModerationDecision, ToyModerationDetail } from '../types'
import { ToyModerationReviewPage } from './ToyModerationReviewPage'

// No network: the feature api module is replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  toyModerationApi: { detail: vi.fn(), approve: vi.fn(), reject: vi.fn() },
}))

const detail = vi.mocked(toyModerationApi.detail)
const approve = vi.mocked(toyModerationApi.approve)

const TOY_ID = '64b000000000000000000001'

const pendingToy: ToyModerationDetail = {
  id: TOY_ID,
  title: 'Tàu hoả gỗ',
  listingType: 'rent',
  status: 'pending',
  condition: 'Như mới',
  ageRange: { minAge: 3, maxAge: 6 },
  priceOrRate: 20_000,
  depositPrice: 300_000,
  coverImage: null,
  imageCount: 0,
  category: { id: '64b000000000000000000002', name: 'Đồ chơi gỗ', status: 'active' },
  owner: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  description: 'Bộ 20 chi tiết.',
  images: [],
  minPhotos: 1,
  moderation: {
    submittedAt: '2026-11-01T00:00:00.000Z',
    rejectReason: null,
    reviewedBy: null,
    reviewedAt: null,
    safetyChecklist: null,
  },
  warnings: [],
}

const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: '/admin/toys/:id', element: <ToyModerationReviewPage /> },
      { path: '/admin/toys', element: <p>Hàng chờ</p> },
    ],
    { initialEntries: [`/admin/toys/${TOY_ID}`] },
  )
  renderWithProviders(<RouterProvider router={router} />)
  return userEvent.setup()
}

const approveButton = () => screen.getByRole('button', { name: /Duyệt/ })

beforeEach(() => {
  detail.mockReset()
  approve.mockReset()
})

describe('ToyModerationReviewPage safety checklist (GB-48)', () => {
  // Ticks 5 boxes and confirms: ~4 s alone, over vitest's 5 s default when the whole suite runs.
  it('keeps Approve disabled until every item is ticked, then sends the ticks', async () => {
    detail.mockResolvedValue(pendingToy)
    approve.mockResolvedValue({} as ToyModerationDecision)
    const user = renderPage()

    await screen.findByText('Kiểm tra an toàn')
    expect(approveButton()).toBeDisabled()
    // Reject needs no checklist.
    expect(screen.getByRole('button', { name: /Từ chối/ })).toBeEnabled()

    const [last, ...others] = [...safetyChecklistItems].reverse()
    for (const item of others) await user.click(screen.getByLabelText(item.label))
    expect(approveButton()).toBeDisabled()
    await user.click(screen.getByLabelText(last.label))
    expect(approveButton()).toBeEnabled()

    await user.click(approveButton())
    await user.click(await screen.findByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    expect(approve).toHaveBeenCalledWith(TOY_ID, pendingToy.updatedAt, {
      photosShowWholeToy: true,
      ageFitsSmallParts: true,
      batteryCompartmentSecured: true,
      notRecalledOrBanned: true,
      noHiddenDefect: true,
    })
  }, 15_000)

  // Admin review 20/11 #6: a disabled button gets no mouse events, so its tooltip never showed.
  it('explains the disabled Approve button on hover', async () => {
    detail.mockResolvedValue(pendingToy)
    const user = renderPage()

    await screen.findByText('Kiểm tra an toàn')
    expect(approveButton()).toBeDisabled()
    await user.hover(approveButton())
    expect(
      await screen.findByText('Đánh dấu đủ các mục kiểm tra an toàn trước khi duyệt.'),
    ).toBeInTheDocument()
  })

  it('shows the stored checklist read-only on an approved post', async () => {
    const ticked = Object.fromEntries(safetyChecklistItems.map((item) => [item.key, true]))
    detail.mockResolvedValue({
      ...pendingToy,
      status: 'active',
      moderation: { ...pendingToy.moderation, safetyChecklist: ticked as never },
    })
    renderPage()

    const first = await screen.findByLabelText(safetyChecklistItems[0].label)
    expect(first).toBeChecked()
    expect(first).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Duyệt/ })).not.toBeInTheDocument()
  })
})
