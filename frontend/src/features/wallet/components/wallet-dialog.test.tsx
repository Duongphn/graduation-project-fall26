import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { WalletDialog } from './wallet-dialog'

function Harness({ busy = false, onClose = vi.fn() }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Mở
      </button>
      {open && (
        <WalletDialog
          title="Hộp thử"
          busy={busy}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        >
          <input aria-label="Ô đầu" />
          <button type="button">Nút cuối</button>
        </WalletDialog>
      )}
    </>
  )
}

describe('WalletDialog', () => {
  it('focuses the first field, keeps Tab inside and locks the page scroll', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Mở' }))

    const dialog = screen.getByRole('dialog', { name: 'Hộp thử' })
    expect(screen.getByLabelText('Ô đầu')).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    // Close (X) → field → last button → back to the close button
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Nút cuối' })).toHaveFocus()
    await userEvent.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Nút cuối' })).toHaveFocus()
  })

  it('closes with Escape, unlocks the scroll and gives focus back to the opener', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Mở' })
    await userEvent.click(opener)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
  })

  it('stays open while a request is running', async () => {
    const onClose = vi.fn()
    render(<Harness busy onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mở' }))

    await userEvent.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeDisabled()
  })
})
