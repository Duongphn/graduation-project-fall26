import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { disputesApi } from '../api'
import type { DisputeDetail } from '../types'
import { DisputeDecisionPanel } from './DisputeDecisionPanel'

// No network: the feature api module is replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  disputesApi: { resolve: vi.fn() },
}))

const resolve = vi.mocked(disputesApi.resolve)
const DECISION = 'Ảnh lúc trả cho thấy càng xe bị gãy, ảnh lúc nhận thì còn nguyên vẹn.'
const HOUR = 3_600_000

// R03 example 1: R = 150.000, D = 200.000, p = 10%.
const makeDispute = (overrides: Partial<DisputeDetail> = {}): DisputeDetail =>
  ({
    id: '64b000000000000000000021',
    code: 'DP261107ABCDEF',
    status: 'open',
    reason: 'DAMAGED_ON_RETURN',
    claimant: 'owner',
    openedAt: new Date(Date.now() - 80 * HOUR).toISOString(),
    replyDueAt: new Date(Date.now() - 8 * HOUR).toISOString(),
    frozenAmount: 350_000,
    description: 'Đồ chơi bị gãy càng trước.',
    rentalOrder: {
      pricing: { days: 3, dailyRate: 50_000, rentalFee: 150_000, depositAmount: 200_000, platformFeeRate: 0.1, platformFee: 15_000, totalPayable: 350_000 },
      returnInfo: { photos: [], requestedAt: '2026-11-07T10:00:00Z', lateDays: 0, lateFee: 0 },
    },
    history: [],
    ...overrides,
  }) as unknown as DisputeDetail

const renderPanel = (dispute: DisputeDetail) => {
  renderWithProviders(<DisputeDecisionPanel dispute={dispute} />)
  return userEvent.setup()
}

beforeEach(() => {
  resolve.mockReset()
})

describe('DisputeDecisionPanel (UC19)', () => {
  it('waits for the reply deadline before a ruling can be issued', () => {
    renderPanel(makeDispute({ replyDueAt: new Date(Date.now() + 5 * HOUR).toISOString() }))
    expect(screen.getByText(/Người thuê có thể phản hồi đến/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ra phán quyết/ })).toBeDisabled()
  })

  it('previews the split and sends ruling, rate and reason', async () => {
    resolve.mockResolvedValue(makeDispute({ status: 'resolved' }))
    const user = renderPanel(makeDispute())

    await user.click(screen.getByLabelText('Người thuê có lỗi'))
    await user.click(screen.getByText('25%'))
    // K = 25% × 200.000: chủ đồ 150.000 − 15.000 + 50.000, người thuê 200.000 − 50.000
    expect(screen.getByText('185.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('150.000 ₫')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Lý do gửi cho hai bên'))
    await user.paste(DECISION)
    await user.click(screen.getByRole('button', { name: /Ra phán quyết/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Ra phán quyết' }))

    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith('64b000000000000000000021', {
        ruling: 'RENTER_AT_FAULT',
        compensationRate: 25,
        adminDecision: DECISION,
      }),
    )
  })

  it('asks for a ruling and a 30-character reason', async () => {
    const user = renderPanel(makeDispute())
    await user.type(screen.getByLabelText('Lý do gửi cho hai bên'), 'Quá ngắn')
    await user.click(screen.getByRole('button', { name: /Ra phán quyết/ }))
    expect(screen.getByText('Vui lòng chọn phán quyết.')).toBeInTheDocument()
    expect(screen.getByText('Lý do phán quyết cần ít nhất 30 ký tự.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('shows the issued ruling instead of the form', () => {
    renderPanel(
      makeDispute({
        status: 'resolved',
        resolution: {
          ruling: 'RENTER_AT_FAULT',
          compensationRate: 25,
          compensationAmount: 50_000,
          rentRefundAmount: 0,
          ownerAmount: 185_000,
          renterAmount: 150_000,
          platformFee: 15_000,
          adminDecision: DECISION,
          resolvedAt: '2026-11-10T10:00:00Z',
        },
      }),
    )
    expect(screen.getByText('Người thuê có lỗi')).toBeInTheDocument()
    expect(screen.getByText('185.000 ₫')).toBeInTheDocument()
    expect(screen.getByText(DECISION)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ra phán quyết/ })).not.toBeInTheDocument()
  })
})
