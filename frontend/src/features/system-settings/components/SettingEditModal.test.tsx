import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import { renderWithProviders } from '../../../test/render'
import { systemSettingsApi } from '../api'
import {
  allSettings,
  paymentHoursSetting,
  rentalFeeSetting,
  trustSetting,
  withdrawalMinSetting,
} from '../test-fixtures'
import type { AdminSetting } from '../types'
import { GB38_NOTE, SettingEditModal } from './SettingEditModal'

// No network: each test decides what the server answers.
vi.mock('../api', () => ({
  systemSettingsApi: { list: vi.fn(), update: vi.fn(), reset: vi.fn(), publicSettings: vi.fn() },
}))

const update = vi.mocked(systemSettingsApi.update)
const reset = vi.mocked(systemSettingsApi.reset)

const renderModal = (setting: AdminSetting) => {
  const onClose = vi.fn()
  renderWithProviders(<SettingEditModal setting={setting} settings={allSettings} onClose={onClose} />)
  return { onClose, user: userEvent.setup() }
}

const valueInput = () => screen.getByLabelText(/Giá trị mới/)
const saveButton = () => screen.getByRole('button', { name: 'Lưu' })

// The confirmation of modal.confirm (antd gives its dialog no accessible name).
const findConfirm = async () => {
  const [title] = await screen.findAllByText('Lưu thay đổi cấu hình?')
  return title!.closest<HTMLElement>('.ant-modal')!
}

const typeValue = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.clear(valueInput())
  if (text) await user.type(valueInput(), text)
}

beforeEach(() => {
  update.mockReset()
  reset.mockReset()
})

describe('SettingEditModal (UC30 Setting Detail)', () => {
  it('shows the setting, its default, range, last change and the GB-38 note', () => {
    renderModal(paymentHoursSetting)
    expect(screen.getByText('Sửa cấu hình: Hạn thanh toán sau khi chủ đồ đồng ý')).toBeInTheDocument()
    expect(screen.getByText(GB38_NOTE)).toBeInTheDocument()
    expect(screen.getByText('6 giờ')).toBeInTheDocument()
    expect(screen.getByText('1–168 giờ')).toBeInTheDocument()
    expect(screen.getByText(/Admin Một ·/)).toBeInTheDocument()
    expect(valueInput()).toHaveValue('6')
    // Nothing typed yet: Save is off
    expect(saveButton()).toBeDisabled()
  })

  it('shows the validation message of each wrong input and sends nothing', async () => {
    const { user } = renderModal(paymentHoursSetting)
    const cases: Array<[string, string]> = [
      ['', 'Vui lòng nhập giá trị.'],
      ['   ', 'Vui lòng nhập giá trị.'],
      ['abc', 'Giá trị phải là một số.'],
      ['1,5', 'Giá trị phải là số nguyên.'],
      ['0', 'Giá trị phải từ 1 giờ đến 168 giờ.'],
      ['169', 'Giá trị phải từ 1 giờ đến 168 giờ.'],
      [' 6 ', 'Giá trị mới trùng với giá trị đang áp dụng.'],
    ]
    for (const [text, message] of cases) {
      await typeValue(user, text)
      await user.click(saveButton())
      expect(await screen.findByText(message)).toBeInTheDocument()
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps the minimum withdrawal at or below the maximum in use', async () => {
    const { user } = renderModal(withdrawalMinSetting)
    await typeValue(user, '20.000.001')
    await user.click(saveButton())
    expect(
      await screen.findByText('Số tiền rút tối thiểu không được lớn hơn số tiền rút tối đa (20.000.000 VND).'),
    ).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('asks for confirmation, then saves the parsed value with the note and closes', async () => {
    update.mockResolvedValue({ data: { ...rentalFeeSetting, value: 12.5 }, message: 'Đã lưu cấu hình.' })
    const { onClose, user } = renderModal(rentalFeeSetting)
    await typeValue(user, ' 12,5 ')
    await user.type(screen.getByLabelText(/Ghi chú/), '  Tăng phí  ')
    await user.click(saveButton())

    const confirm = await findConfirm()
    expect(within(confirm).getByText('10%')).toBeInTheDocument()
    expect(within(confirm).getByText('12,5%')).toBeInTheDocument()
    expect(within(confirm).getByText(rentalFeeSetting.appliesTo)).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]?.[0]).toEqual({ key: 'rental.platformFeeRate', value: 12.5, note: 'Tăng phí' })
    expect(await screen.findByText('Đã lưu cấu hình.')).toBeInTheDocument()
  })

  it('sends nothing when the confirmation is cancelled', async () => {
    const { onClose, user } = renderModal(rentalFeeSetting)
    await typeValue(user, '15')
    await user.click(saveButton())
    const confirm = await findConfirm()
    await user.click(within(confirm).getByRole('button', { name: 'Huỷ' }))
    expect(update).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('puts a server field error on the value and stays open', async () => {
    update.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Giá trị phải từ 0% đến 50%.', [
        { field: 'value', message: 'Giá trị phải từ 0% đến 50%.' },
      ]),
    )
    const { onClose, user } = renderModal(rentalFeeSetting)
    await typeValue(user, '20')
    await user.click(saveButton())
    const confirm = await findConfirm()
    await user.click(within(confirm).getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Giá trị phải từ 0% đến 50%.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('resets to the default after a confirmation; off when the default is in use', async () => {
    reset.mockResolvedValue({ data: { ...paymentHoursSetting, value: 12, isDefault: true }, message: 'Đã đặt lại giá trị mặc định.' })
    const { onClose, user } = renderModal(paymentHoursSetting)
    await user.click(screen.getByRole('button', { name: 'Đặt lại mặc định' }))
    expect(await screen.findByText('Đặt lại giá trị mặc định?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Đặt lại' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(reset.mock.calls[0]?.[0]).toEqual({ key: 'rental.paymentHours' })
  })

  it('cannot reset a setting already at its default', () => {
    renderModal(rentalFeeSetting)
    expect(screen.getByRole('button', { name: 'Đặt lại mặc định' })).toBeDisabled()
  })

  it('warns about an invalid stored value and lets the Admin repair it', async () => {
    update.mockResolvedValue({ data: { ...trustSetting, invalidStoredValue: null }, message: 'Đã lưu cấu hình.' })
    const { onClose, user } = renderModal(trustSetting)
    expect(screen.getByText(/Giá trị đang lưu "abc" không hợp lệ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đặt lại mặc định' })).toBeEnabled()
    // The same value as the one in use is allowed here (it repairs the stored text)
    await user.click(saveButton())
    const confirm = await findConfirm()
    await user.click(within(confirm).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(update.mock.calls[0]?.[0]).toEqual({ key: 'rental.minTrustScore', value: 50 })
  })
})
