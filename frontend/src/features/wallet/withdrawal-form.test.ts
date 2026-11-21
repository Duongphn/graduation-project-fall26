import { describe, expect, it } from 'vitest'

import {
  maskAccountNumber,
  maxWithdrawableAmount,
  toAccountHolderName,
  validateWithdrawalForm,
  type WithdrawalFormValues,
} from './withdrawal-form'

const valid: WithdrawalFormValues = {
  amount: 500_000,
  bankName: 'Vietcombank',
  accountNumber: '0123456789',
  accountHolderName: 'NGUYEN VAN A',
}

describe('withdrawal form', () => {
  it('accepts a complete request within the balance and limits', () => {
    expect(validateWithdrawalForm(valid, 1_000_000)).toEqual({})
  })

  it('checks the limits and the available balance', () => {
    expect(validateWithdrawalForm({ ...valid, amount: undefined }, 1_000_000).amount).toMatch(/nhập số tiền/)
    expect(validateWithdrawalForm({ ...valid, amount: 49_000 }, 1_000_000).amount).toMatch(/tối thiểu/)
    expect(validateWithdrawalForm({ ...valid, amount: 20_000_001 }, 50_000_000).amount).toMatch(/tối đa/)
    expect(validateWithdrawalForm({ ...valid, amount: 600_000 }, 500_000).amount).toMatch(/Số dư khả dụng chỉ còn/)
  })

  it('checks the bank, the account number and the holder name', () => {
    const errors = validateWithdrawalForm(
      { ...valid, bankName: '', accountNumber: '12ab', accountHolderName: ' ' },
      1_000_000,
    )
    expect(errors.bankName).toMatch(/chọn ngân hàng/)
    expect(errors.accountNumber).toMatch(/6 đến 25/)
    expect(errors.accountHolderName).toMatch(/tên chủ tài khoản/)
  })

  it('writes the holder name in capitals without accents', () => {
    expect(toAccountHolderName('Nguyễn Văn Đạt')).toBe('NGUYEN VAN DAT')
    expect(toAccountHolderName('  trần  thị 2 b')).toBe('TRAN THI B')
  })

  it('masks the account number and caps "Rút tối đa" at the per-request limit', () => {
    expect(maskAccountNumber('0123456789')).toBe('•••• 6789')
    expect(maxWithdrawableAmount(650_000)).toBe(650_000)
    expect(maxWithdrawableAmount(90_000_000)).toBe(20_000_000)
  })
})
