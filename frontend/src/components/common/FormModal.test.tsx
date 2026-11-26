import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from 'antd'
import { describe, expect, it, vi } from 'vitest'

import { FormModal } from './FormModal'

const renderModal = (props: { loading?: boolean; okDisabled?: boolean } = {}) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <FormModal open title="Sửa" onSubmit={onSubmit} onCancel={onCancel} {...props}>
      <Input aria-label="Tên" />
    </FormModal>,
  )
  return { onSubmit, onCancel, user: userEvent.setup() }
}

const okButton = () => screen.getByRole('button', { name: /Lưu/ })

describe('FormModal', () => {
  it('submits with the OK button and with Enter in a field', async () => {
    const { onSubmit, user } = renderModal()
    await user.click(okButton())
    await user.type(screen.getByLabelText('Tên'), 'Xe{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('ignores OK and Enter while loading', async () => {
    const { onSubmit, user } = renderModal({ loading: true })
    await user.click(okButton())
    await user.type(screen.getByLabelText('Tên'), 'Xe{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ignores OK and Enter while okDisabled', async () => {
    const { onSubmit, user } = renderModal({ okDisabled: true })
    expect(okButton()).toBeDisabled()
    await user.type(screen.getByLabelText('Tên'), 'Xe{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('closes with Esc, Huỷ or X when idle', async () => {
    const { onCancel, user } = renderModal()
    await user.click(screen.getByLabelText('Tên'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('cannot be closed while loading', async () => {
    const { onCancel, user } = renderModal({ loading: true })
    await user.click(screen.getByLabelText('Tên'))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
