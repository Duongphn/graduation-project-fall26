import { describe, expect, it } from 'vitest'

import { shipDonationSchema, toHandoverInput, type ShipDonationValues } from './schemas'

const photo = { publicId: 'toyflow/handovers/u1/p1', url: 'https://example.test/p1.png', format: 'png' }
const values = (overrides: Partial<ShipDonationValues>): ShipDonationValues => ({
  method: 'CARRIER',
  carrier: '',
  trackingCode: '',
  photos: [photo],
  note: '',
  ...overrides,
})

// GB-58: the handover body the backend validates (handoverMethod is required there).
describe('toHandoverInput', () => {
  it('sends a carrier handover with the carrier name and the tracking code', () => {
    expect(
      toHandoverInput(values({ carrier: 'Giao Hàng Nhanh (GHN)', trackingCode: 'ghn12345678', note: 'Hàng dễ vỡ' })),
    ).toEqual({
      handoverMethod: 'carrier',
      carrierName: 'Giao Hàng Nhanh (GHN)',
      trackingCode: 'GHN12345678',
      photos: [{ publicId: photo.publicId, format: 'png' }],
      note: 'Hàng dễ vỡ',
    })
  })

  it('sends a drop-off without carrier fields', () => {
    expect(toHandoverInput(values({ method: 'SELF', carrier: 'Viettel Post', trackingCode: 'VT123456' }))).toEqual({
      handoverMethod: 'drop_off',
      photos: [{ publicId: photo.publicId, format: 'png' }],
    })
  })
})

describe('shipDonationSchema', () => {
  it('accepts a carrier handover without the optional carrier name and tracking code', () => {
    expect(shipDonationSchema.safeParse(values({})).success).toBe(true)
  })

  it('still checks a tracking code that is typed', () => {
    expect(shipDonationSchema.safeParse(values({ trackingCode: 'ab' })).success).toBe(false)
  })
})
