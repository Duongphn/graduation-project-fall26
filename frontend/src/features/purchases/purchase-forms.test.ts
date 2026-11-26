import { afterEach, describe, expect, it, vi } from 'vitest'

import * as http from '../../services/http'
import { purchaseApi } from './purchase-api'
import { nextAction } from './purchase-display'
import { toBuyNowInput, validateCheckout, validateShip, type CheckoutFormValues } from './purchase-forms'

const delivery: CheckoutFormValues = {
  deliveryMethod: 'DELIVERY',
  recipientName: 'Nguyễn Văn A',
  recipientPhone: '0901 234 567',
  province: 'Hà Nội',
  ward: 'Phường Hoàn Kiếm',
  street: '12 Lý Thường Kiệt',
  notes: '',
}

describe('checkout form', () => {
  it('needs the recipient and the address for home delivery', () => {
    expect(validateCheckout(delivery)).toEqual({})
    const errors = validateCheckout({ ...delivery, recipientName: 'A', recipientPhone: '123', province: '', ward: '', street: '' })
    expect(Object.keys(errors).sort()).toEqual(['province', 'recipientName', 'recipientPhone', 'street', 'ward'])
  })

  it('needs nothing but the method for local pickup', () => {
    expect(validateCheckout({ ...delivery, deliveryMethod: 'LOCAL_PICKUP', recipientName: '', street: '' })).toEqual({})
  })

  it('sends the address only for delivery, with the phone number cleaned', () => {
    expect(toBuyNowInput('t1', delivery)).toEqual({
      toyId: 't1',
      deliveryMethod: 'DELIVERY',
      recipientName: 'Nguyễn Văn A',
      recipientPhone: '0901234567',
      province: 'Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      street: '12 Lý Thường Kiệt',
      notes: undefined,
    })
    expect(toBuyNowInput('t1', { ...delivery, deliveryMethod: 'LOCAL_PICKUP', notes: ' Gọi trước ' })).toEqual({
      toyId: 't1',
      deliveryMethod: 'LOCAL_PICKUP',
      notes: 'Gọi trước',
    })
  })
})

describe('ship form', () => {
  const base = { carrierName: 'Viettel Post', trackingCode: 'VTP123', photoCount: 1, note: '' }

  it('needs a carrier, a photo and a tracking code for a parcel', () => {
    expect(validateShip(base, 'DELIVERY')).toEqual({})
    expect(validateShip({ ...base, carrierName: '', trackingCode: '', photoCount: 0 }, 'DELIVERY')).toMatchObject({
      carrierName: expect.any(String),
      photos: expect.any(String),
    })
    expect(validateShip({ ...base, trackingCode: '' }, 'DELIVERY').trackingCode).toMatch(/mã vận đơn/)
  })

  it('does not need a tracking code for hand delivery or local pickup', () => {
    expect(validateShip({ ...base, carrierName: 'Giao trực tiếp', trackingCode: '' }, 'DELIVERY')).toEqual({})
    expect(validateShip({ ...base, trackingCode: '' }, 'LOCAL_PICKUP')).toEqual({})
  })
})

describe('next action', () => {
  const order = { status: 'PAID' } as Parameters<typeof nextAction>[0]
  it('asks the seller to ship a paid order and the buyer to confirm a shipped one', () => {
    expect(nextAction(order, 'seller')).toBe('Cần gửi hàng')
    expect(nextAction(order, 'buyer')).toBeUndefined()
    expect(nextAction({ ...order, status: 'SHIPPING' }, 'buyer')).toBe('Xác nhận đã nhận')
  })
})

describe('purchase API calls', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses the backend paths and turns the list into the shared pagination shape', async () => {
    const apiPost = vi.spyOn(http, 'apiPost').mockResolvedValue({})
    const apiGet = vi.spyOn(http, 'apiGet').mockResolvedValue({ items: [], total: 25, page: 2, limit: 10 })

    await purchaseApi.quote('t1', 'LOCAL_PICKUP')
    await purchaseApi.ship('o1', { carrierName: 'GHN', photos: [] })
    await purchaseApi.receive('o1')
    const sold = await purchaseApi.list('seller', 2, 10)

    expect(apiPost).toHaveBeenCalledWith('/purchase-orders/quote', { toyId: 't1', deliveryMethod: 'LOCAL_PICKUP' })
    expect(apiPost).toHaveBeenCalledWith('/purchase-orders/o1/ship', { carrierName: 'GHN', photos: [] })
    expect(apiPost).toHaveBeenCalledWith('/purchase-orders/o1/receive', {})
    expect(apiGet).toHaveBeenCalledWith('/purchase-orders/sold', { page: 2, limit: 10 })
    expect(sold.pagination).toMatchObject({ totalItems: 25, totalPages: 3, hasNextPage: true, hasPrevPage: true })
  })
})
