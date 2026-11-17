import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CategoryOrderControl } from './CategoryOrderControl'

const REASON = 'Bỏ bộ lọc để sắp xếp thứ tự'

describe('CategoryOrderControl', () => {
  it('gives keyboard and screen reader users the reason the moves are blocked', async () => {
    render(
      <CategoryOrderControl
        displayOrder={2}
        isFirst={false}
        isLast={false}
        disabledReason={REASON}
        onMove={vi.fn()}
      />,
    )

    for (const label of ['Đưa lên trên', 'Đưa xuống dưới']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
      const reason = screen.getByRole('note', { name: `${label}: ${REASON}` })
      expect(reason).toHaveAttribute('tabindex', '0')
    }
    // The reason is reachable with Tab although both buttons are disabled.
    await userEvent.setup().tab()
    expect(screen.getByRole('note', { name: `Đưa lên trên: ${REASON}` })).toHaveFocus()
    // Sighted keyboard users see it too: the tooltip opens on focus, not only on hover.
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON)
  })

  it('adds nothing to the wrappers when only the list edges disable a move', async () => {
    const onMove = vi.fn()
    render(<CategoryOrderControl displayOrder={1} isFirst isLast={false} onMove={onMove} />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đưa lên trên' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Đưa xuống dưới' }))
    expect(onMove).toHaveBeenCalledWith(1)
  })
})
