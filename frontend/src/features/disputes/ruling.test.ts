import { describe, expect, it } from 'vitest'

import { previewRuling } from './ruling'

const pricing = { rentalFee: 150_000, depositAmount: 200_000, platformFeeRate: 0.1 }

describe('previewRuling (R03 I.2.6.6)', () => {
  it('R03 example 1b: 25% of the deposit goes to the Owner', () => {
    expect(previewRuling(pricing, 0, 'owner', 'RENTER_AT_FAULT', 25)).toEqual({
      frozen: 350_000,
      compensation: 50_000,
      rentRefund: 0,
      owner: 185_000,
      platform: 15_000,
      renter: 150_000,
    })
  })

  it('caps the compensation at the deposit left after the late fee', () => {
    const split = previewRuling(pricing, 100_000, 'owner', 'RENTER_AT_FAULT', 100)
    expect(split).toMatchObject({ compensation: 100_000, owner: 335_000, renter: 0 })
    expect(split.owner + split.platform + split.renter).toBe(split.frozen)
  })

  it('gives no compensation when the Renter is not at fault', () => {
    expect(previewRuling(pricing, 0, 'owner', 'FAIR_WEAR_AND_TEAR', 50)).toMatchObject({
      compensation: 0,
      owner: 135_000,
      renter: 200_000,
    })
  })
})
