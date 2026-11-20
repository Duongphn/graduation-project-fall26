import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { CancelDonationCard } from './cancel-donation-card'

// R03 III.5.2.2 (13): the Donor's Cancel asks for an optional reason.
describe('CancelDonationCard', () => {
  it('cancels without a reason', async () => {
    const onCancel = vi.fn()
    renderWithProviders(<CancelDonationCard loading={false} onCancel={onCancel} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Huỷ phiếu quyên góp/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Lý do huỷ \(không bắt buộc/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ phiếu' }))

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onCancel.mock.calls[0]?.[0]).toBe('')
  })

  it('still sends a reason the Donor typed', async () => {
    const onCancel = vi.fn()
    renderWithProviders(<CancelDonationCard loading={false} onCancel={onCancel} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Huỷ phiếu quyên góp/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'Hư')
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ phiếu' }))

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onCancel.mock.calls[0]?.[0]).toBe('Hư')
  })
})
