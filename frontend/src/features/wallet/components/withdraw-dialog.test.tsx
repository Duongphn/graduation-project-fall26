import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import { systemSettingsApi } from '../../system-settings/api'
import { walletApi, type WithdrawalRequest } from '../wallet-api'
import { WithdrawDialog } from './withdraw-dialog'
import { WithdrawalList } from './withdrawal-list'

const created: WithdrawalRequest = {
  id: 'w1',
  code: 'WD_1',
  amount: 500_000,
  bankInfo: { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A' },
  status: 'pending',
  createdAt: '2026-11-19T01:00:00.000Z',
  updatedAt: '2026-11-19T01:00:00.000Z',
}

const renderDialog = (availableBalance = 1_000_000) => {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <WithdrawDialog availableBalance={availableBalance} onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>,
  )
  return { onClose, onCreated, invalidate }
}

const fillForm = async (amount: string) => {
  await userEvent.type(screen.getByLabelText('Số tiền rút'), amount)
  await userEvent.selectOptions(screen.getByLabelText('Ngân hàng'), 'Vietcombank')
  await userEvent.type(screen.getByLabelText('Số tài khoản'), '0123456789')
  await userEvent.type(screen.getByLabelText('Tên chủ tài khoản'), 'Nguyễn Văn A')
}

describe('WithdrawDialog', () => {
  // Limits of System Settings (UC30): the defaults unless a test sets others
  const publicSettings = (minAmount = 50_000, maxAmount = 20_000_000) =>
    vi.spyOn(systemSettingsApi, 'publicSettings').mockResolvedValue({ withdrawal: { minAmount, maxAmount } })

  beforeEach(() => {
    publicSettings()
  })
  afterEach(() => vi.restoreAllMocks())

  it('uses the withdrawal limits the Admin set (UC30)', async () => {
    publicSettings(100_000, 1_000_000)
    const createWithdrawal = vi.spyOn(walletApi, 'createWithdrawal')
    renderDialog(5_000_000)

    expect(await screen.findByText('Từ 100.000 ₫ đến 1.000.000 ₫ mỗi lần.')).toBeInTheDocument()
    await fillForm('99999')
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.getByText('Số tiền rút tối thiểu là 100.000 ₫.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Rút tối đa' }))
    expect(screen.getByLabelText('Số tiền rút')).toHaveValue('1.000.000')
    expect(createWithdrawal).not.toHaveBeenCalled()
  })

  it('confirms the details, creates a pending withdrawal and refreshes the wallet', async () => {
    const createWithdrawal = vi.spyOn(walletApi, 'createWithdrawal').mockResolvedValue(created)
    const { onCreated, invalidate } = renderDialog()

    await fillForm('500000')
    expect(screen.getByLabelText('Tên chủ tài khoản')).toHaveValue('NGUYEN VAN A')
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    // Confirmation step: masked account and the balance left after the hold
    expect(screen.getByRole('heading', { name: 'Xác nhận rút tiền' })).toBeInTheDocument()
    expect(screen.getByText('•••• 6789')).toBeInTheDocument()
    expect(createWithdrawal).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận rút tiền' }))

    expect(createWithdrawal).toHaveBeenCalledWith({
      amount: 500_000,
      bankInfo: { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A' },
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet', 'me'] })
    expect(onCreated).toHaveBeenCalledWith(created)
  })

  it('moves focus to the confirm button and back to the amount when editing', async () => {
    renderDialog()
    await fillForm('500000')
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    expect(screen.getByRole('button', { name: 'Xác nhận rút tiền' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: /Sửa thông tin/ }))
    expect(screen.getByLabelText('Số tiền rút')).toHaveFocus()
    expect(screen.getByLabelText('Số tiền rút')).toHaveValue('500.000')
  })

  it('blocks an amount above the available balance', async () => {
    const createWithdrawal = vi.spyOn(walletApi, 'createWithdrawal')
    renderDialog(300_000)

    await fillForm('400000')
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    expect(screen.getByText(/Số dư khả dụng chỉ còn/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rút tiền về ngân hàng' })).toBeInTheDocument()
    expect(createWithdrawal).not.toHaveBeenCalled()
  })

  it('fills the whole available balance with "Rút tối đa"', async () => {
    renderDialog(650_000)
    await userEvent.click(screen.getByRole('button', { name: 'Rút tối đa' }))
    expect(screen.getByLabelText('Số tiền rút')).toHaveValue('650.000')
  })

  it('cannot continue when the balance is below the minimum', () => {
    renderDialog(20_000)
    expect(screen.getByText(/chưa đủ mức rút tối thiểu/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  })

  it('shows the server error on the confirmation step', async () => {
    vi.spyOn(walletApi, 'createWithdrawal').mockRejectedValue(
      new ApiError(400, 'PENDING_WITHDRAWAL_EXISTS', 'Bạn đang có một yêu cầu rút tiền đang chờ xử lý.'),
    )
    const { onCreated } = renderDialog()

    await fillForm('500000')
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận rút tiền' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('đang chờ xử lý')
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('WithdrawalList', () => {
  it('shows the status and what happened: transferred, or refunded with the reason', () => {
    render(
      <WithdrawalList
        withdrawals={[
          created,
          { ...created, id: 'w2', status: 'rejected', notes: 'Sai tên chủ tài khoản', processedAt: '2026-11-20T03:00:00.000Z' },
          { ...created, id: 'w3', status: 'completed', processedAt: '2026-11-21T03:00:00.000Z' },
        ]}
      />,
    )
    expect(screen.getByText('Đang chờ xử lý')).toBeInTheDocument()
    expect(screen.getByText(/ToyFlow sẽ chuyển khoản sau khi duyệt/)).toBeInTheDocument()
    expect(screen.getByText('Bị từ chối, đã hoàn tiền')).toBeInTheDocument()
    expect(screen.getByText(/Đã hoàn .* vào ví lúc 10:00 20\/11\/2026\. Lý do: Sai tên chủ tài khoản/)).toBeInTheDocument()
    expect(screen.getByText('Đã chuyển khoản')).toBeInTheDocument()
    expect(screen.getByText('Đã chuyển về tài khoản của bạn lúc 10:00 21/11/2026.')).toBeInTheDocument()
    expect(screen.getAllByText(/•••• 6789/)).toHaveLength(3)
  })
})
