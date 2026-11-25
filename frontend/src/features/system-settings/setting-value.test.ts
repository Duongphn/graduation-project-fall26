import { describe, expect, it } from 'vitest'

import {
  formatSettingRange,
  formatSettingValue,
  parseSettingInput,
  toInputText,
  withdrawalOrderError,
} from './setting-value'
import {
  allSettings,
  paymentHoursSetting,
  rentalFeeSetting,
  withdrawalMaxSetting,
  withdrawalMinSetting,
} from './test-fixtures'

const ok = (value: number) => ({ ok: true, value })
const fail = (message: string) => ({ ok: false, message })

describe('parseSettingInput (same rules as the server)', () => {
  it('accepts spaces, a decimal comma or dot for rates', () => {
    expect(parseSettingInput(rentalFeeSetting, ' 12 ')).toEqual(ok(12))
    expect(parseSettingInput(rentalFeeSetting, '12,5')).toEqual(ok(12.5))
    expect(parseSettingInput(rentalFeeSetting, '12.5')).toEqual(ok(12.5))
    expect(parseSettingInput(rentalFeeSetting, '12,345')).toEqual(fail('Chỉ nhập tối đa 2 chữ số thập phân.'))
  })

  it('accepts thousand separators for whole numbers only', () => {
    expect(parseSettingInput(withdrawalMinSetting, '100.000')).toEqual(ok(100_000))
    expect(parseSettingInput(withdrawalMinSetting, '100 000')).toEqual(ok(100_000))
    // R5.0 II.1: staging shortens time limits to minutes, so hours take up to 2 decimals
    expect(parseSettingInput(paymentHoursSetting, '1,5')).toEqual(ok(1.5))
    expect(parseSettingInput(paymentHoursSetting, ' 0,1 ')).toEqual(ok(0.1))
    expect(parseSettingInput(paymentHoursSetting, '0,005')).toEqual(fail('Chỉ nhập tối đa 2 chữ số thập phân.'))
  })

  it('refuses empty and non-number texts', () => {
    expect(parseSettingInput(paymentHoursSetting, '')).toEqual(fail('Vui lòng nhập giá trị.'))
    expect(parseSettingInput(paymentHoursSetting, '   ')).toEqual(fail('Vui lòng nhập giá trị.'))
    expect(parseSettingInput(paymentHoursSetting, 'mười')).toEqual(fail('Giá trị phải là một số.'))
    expect(parseSettingInput(rentalFeeSetting, '10%')).toEqual(fail('Giá trị phải là một số.'))
  })

  it('checks the range one step past each end', () => {
    expect(parseSettingInput(paymentHoursSetting, '0')).toEqual(fail('Giá trị phải từ 0,01 giờ đến 168 giờ.'))
    expect(parseSettingInput(paymentHoursSetting, '169')).toEqual(fail('Giá trị phải từ 0,01 giờ đến 168 giờ.'))
    expect(parseSettingInput(paymentHoursSetting, '168')).toEqual(ok(168))
    expect(parseSettingInput(rentalFeeSetting, '50,01')).toEqual(fail('Giá trị phải từ 0% đến 50%.'))
    expect(parseSettingInput(rentalFeeSetting, '-1')).toEqual(fail('Giá trị phải từ 0% đến 50%.'))
  })
})

describe('formatting', () => {
  it('shows values and ranges with the Vietnamese unit', () => {
    expect(formatSettingValue(rentalFeeSetting, 12.5)).toBe('12,5%')
    expect(formatSettingValue(withdrawalMinSetting, 50_000)).toBe('50.000 VND')
    expect(formatSettingRange(paymentHoursSetting)).toBe('0,01–168 giờ')
    expect(formatSettingRange(rentalFeeSetting)).toBe('0%–50%')
    expect(toInputText(12.5)).toBe('12,5')
  })
})

describe('withdrawalOrderError', () => {
  it('keeps the minimum at or below the maximum in use', () => {
    expect(withdrawalOrderError(withdrawalMinSetting, 20_000_001, allSettings)).toBe(
      'Số tiền rút tối thiểu không được lớn hơn số tiền rút tối đa (20.000.000 VND).',
    )
    expect(withdrawalOrderError(withdrawalMinSetting, 20_000_000, allSettings)).toBeUndefined()
    expect(withdrawalOrderError(withdrawalMaxSetting, 49_999, allSettings)).toBe(
      'Số tiền rút tối đa không được nhỏ hơn số tiền rút tối thiểu (50.000 VND).',
    )
    expect(withdrawalOrderError(paymentHoursSetting, 1, allSettings)).toBeUndefined()
  })
})
