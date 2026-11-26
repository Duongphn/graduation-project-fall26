import { describe, expect, it } from 'vitest'

import { notificationTargetPath } from './notification-target'

describe('notificationTargetPath', () => {
  it('opens the link the server stored', () => {
    expect(notificationTargetPath({ type: 'RENTAL_ORDER', link: '/rentals/mine/abc' })).toBe('/rentals/mine/abc')
    expect(notificationTargetPath({ type: 'DONATION_STATUS_CHANGED', link: '/admin/donation-requests/1' })).toBe(
      '/admin/donation-requests/1',
    )
  })

  it('never follows a link to another site', () => {
    expect(notificationTargetPath({ type: 'SYSTEM', link: 'https://evil.test' })).toBeNull()
    expect(notificationTargetPath({ type: 'SYSTEM', link: '//evil.test' })).toBeNull()
  })

  it('falls back to the list page of the type for older notifications', () => {
    expect(notificationTargetPath({ type: 'IDENTITY_REVIEWED', link: null })).toBe('/profile/verification')
    expect(notificationTargetPath({ type: 'TOY_REVIEWED', link: null })).toBe('/listings')
    expect(notificationTargetPath({ type: 'RENTAL_ORDER', link: null })).toBeNull()
  })
})
