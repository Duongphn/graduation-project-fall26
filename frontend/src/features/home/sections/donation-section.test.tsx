import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PATHS } from '../../../routes/paths'
import { DonationSection } from './donation-section'

describe('DonationSection', () => {
  // UC33: the banner opens the donation form, not the rent/sell listing form.
  it('links "Tặng đồ chơi" to the new donation form', () => {
    render(
      <MemoryRouter>
        <DonationSection />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Tặng đồ chơi/ })).toHaveAttribute('href', PATHS.newDonation)
  })
})
