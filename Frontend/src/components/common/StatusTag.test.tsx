import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ThemeContext } from '../../contexts/theme-context'
import { palettes } from '../../styles/palette'
import { darkToneColors, toneColors } from '../../styles/status'
import { StatusTag } from './StatusTag'

const renderTag = (isDark: boolean) =>
  render(
    <ThemeContext.Provider value={{ isDark, toggleTheme: () => {} }}>
      <StatusTag domain="visibility" status="ACTIVE" />
      <StatusTag domain="toy" status="REJECTED" />
    </ThemeContext.Provider>,
  )

describe('StatusTag', () => {
  it('shows the Vietnamese label of the status in its domain', () => {
    renderTag(false)
    expect(screen.getByText('Đang dùng')).toBeInTheDocument()
    expect(screen.getByText('Bị từ chối')).toBeInTheDocument()
  })

  it('uses the antd filled tag in the light tone colour (text) on a tint of it', () => {
    renderTag(false)
    const active = screen.getByText('Đang dùng')
    expect(active).toHaveClass('ant-tag-filled')
    expect(active).toHaveStyle({ color: toneColors.success })
    expect(active).not.toHaveStyle({ background: palettes.dark.elevated })
    expect(screen.getByText('Bị từ chối')).toHaveStyle({ color: toneColors.error })
  })

  it('uses tone-coloured text and border on the dark elevated surface', () => {
    renderTag(true)
    expect(screen.getByText('Đang dùng')).toHaveStyle({
      color: darkToneColors.success,
      borderColor: darkToneColors.success,
      background: palettes.dark.elevated,
    })
    expect(screen.getByText('Bị từ chối')).toHaveStyle({ color: darkToneColors.error })
  })
})
