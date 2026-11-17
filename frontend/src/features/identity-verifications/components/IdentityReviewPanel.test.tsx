import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { identityVerificationsApi } from '../api'
import type { IdentityReviewResult, IdentityVerificationDetail } from '../types'
import { IdentityReviewPanel } from './IdentityReviewPanel'

// No network: the feature api module is replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  identityVerificationsApi: { approve: vi.fn(), reject: vi.fn() },
}))

const reject = vi.mocked(identityVerificationsApi.reject)

const verification = {
  id: '64b000000000000000000011',
  status: 'pending',
  reviewedAt: null,
  rejectionReason: null,
} as unknown as IdentityVerificationDetail

const renderPanel = () => {
  renderWithProviders(
    <MemoryRouter>
      <IdentityReviewPanel verification={verification} />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  reject.mockReset()
})

describe('IdentityReviewPanel age check (GB-07, L3)', () => {
  it('asks the Admin to check 18+ from the CCCD, not from account data', () => {
    renderPanel()
    expect(screen.getByLabelText('Đủ 18 tuổi theo CCCD')).toBeInTheDocument()
    // The account has no date of birth to compare with.
    expect(screen.queryByText(/ngày sinh/i)).not.toBeInTheDocument()
  })

  it('rejects with the preset reason "Chưa đủ 18 tuổi"', async () => {
    reject.mockResolvedValue({} as IdentityReviewResult)
    const user = renderPanel()

    await user.click(screen.getByRole('button', { name: /Từ chối/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByText('Chưa đủ 18 tuổi'))
    await user.click(within(dialog).getByRole('button', { name: /Từ chối/ }))

    await waitFor(() => expect(reject).toHaveBeenCalledWith(verification.id, 'Chưa đủ 18 tuổi'))
  })
})
