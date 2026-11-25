import type { AdminSetting } from './types'

// Settings as GET /admin/settings returns them, for the feature tests.

const base = {
  invalidStoredValue: null,
  updatedAt: null,
  updatedBy: null,
  isDefault: true,
} as const

export const rentalFeeSetting: AdminSetting = {
  ...base,
  key: 'rental.platformFeeRate',
  group: 'RENTAL',
  groupLabel: 'Thuê đồ',
  label: 'Phí nền tảng đơn thuê',
  description: 'Phần trăm tiền thuê ToyFlow giữ lại, trừ vào tiền chủ đồ nhận khi quyết toán.',
  appliesTo: 'Áp dụng cho yêu cầu thuê tạo sau khi lưu; đơn đã tạo giữ giá trị cũ.',
  unit: 'PERCENT',
  unitLabel: '%',
  min: 0,
  max: 50,
  decimals: 2,
  value: 10,
  defaultValue: 10,
}

export const paymentHoursSetting: AdminSetting = {
  ...base,
  key: 'rental.paymentHours',
  group: 'RENTAL',
  groupLabel: 'Thuê đồ',
  label: 'Hạn thanh toán sau khi chủ đồ đồng ý',
  description: 'Người thuê không thanh toán trong thời hạn này thì đơn thuê bị huỷ.',
  appliesTo: 'Áp dụng cho yêu cầu thuê tạo sau khi lưu; đơn đã tạo giữ giá trị cũ.',
  unit: 'HOURS',
  unitLabel: 'giờ',
  min: 0.01,
  max: 168,
  decimals: 2,
  value: 6,
  defaultValue: 12,
  isDefault: false,
  updatedAt: '2026-11-25T03:00:00.000Z',
  updatedBy: { id: '64b000000000000000000001', fullName: 'Admin Một' },
}

export const withdrawalMinSetting: AdminSetting = {
  ...base,
  key: 'withdrawal.minAmount',
  group: 'WALLET',
  groupLabel: 'Ví',
  label: 'Số tiền rút tối thiểu',
  description: 'Số tiền nhỏ nhất của một lệnh rút.',
  appliesTo: 'Áp dụng cho lệnh rút tạo sau khi lưu; lệnh đang chờ không đổi.',
  unit: 'VND',
  unitLabel: 'VND',
  min: 1_000,
  max: 100_000_000,
  decimals: 0,
  value: 50_000,
  defaultValue: 50_000,
}

export const withdrawalMaxSetting: AdminSetting = {
  ...withdrawalMinSetting,
  key: 'withdrawal.maxAmount',
  label: 'Số tiền rút tối đa mỗi lần',
  description: 'Số tiền lớn nhất của một lệnh rút.',
  max: 1_000_000_000,
  value: 20_000_000,
  defaultValue: 20_000_000,
}

export const trustSetting: AdminSetting = {
  ...base,
  key: 'rental.minTrustScore',
  group: 'TRUST',
  groupLabel: 'Trust Score',
  label: 'Ngưỡng Trust Score',
  description: 'Người thuê có Trust Score dưới ngưỡng này không thuê được đồ chơi có tiền cọc cao.',
  appliesTo: 'Áp dụng cho yêu cầu thuê gửi sau khi lưu; yêu cầu đã gửi không bị chặn lại.',
  unit: 'POINTS',
  unitLabel: 'điểm',
  min: 0,
  max: 100,
  decimals: 0,
  value: 50,
  defaultValue: 50,
  invalidStoredValue: 'abc',
}

export const allSettings: AdminSetting[] = [
  rentalFeeSetting,
  paymentHoursSetting,
  withdrawalMinSetting,
  withdrawalMaxSetting,
  trustSetting,
]
