import {
  DEFAULT_DONATION_SETTINGS,
  DONATION_SETTING_KEYS,
} from './donation-request-transitions.js';
import { WITHDRAWAL_LIMITS } from './wallet-transaction.js';
import { DEFAULT_RENTAL_SETTINGS } from '../types/rental-order.types.js';

// UC30 Configure System: every setting the Admin can change, in one place. The Setting List
// (screen 56) shows them in this order, grouped; the code reads them through
// SystemSettingService. A change applies only to transactions created after it (GB-38).

export const settingGroups = ['RENTAL', 'PURCHASE', 'WALLET', 'TRUST', 'DONATION'] as const;
export type SettingGroup = (typeof settingGroups)[number];

export const settingGroupLabels: Record<SettingGroup, string> = {
  RENTAL: 'Thuê đồ',
  PURCHASE: 'Mua bán',
  WALLET: 'Ví',
  TRUST: 'Trust Score',
  DONATION: 'Quyên góp',
};

export const settingUnits = ['PERCENT', 'MULTIPLIER', 'HOURS', 'DAYS', 'VND', 'POINTS'] as const;
export type SettingUnit = (typeof settingUnits)[number];

export const settingUnitLabels: Record<SettingUnit, string> = {
  PERCENT: '%',
  MULTIPLIER: 'lần',
  HOURS: 'giờ',
  DAYS: 'ngày',
  VND: 'VND',
  POINTS: 'điểm',
};

export interface SettingDefinition {
  /** systemsettings.key, unique */
  key: string;
  group: SettingGroup;
  label: string;
  /** What the setting changes */
  description: string;
  /** Which transactions take the new value (GB-38) */
  appliesTo: string;
  unit: SettingUnit;
  /** Allowed range in the shown unit (percent for rates) */
  min: number;
  max: number;
  /** Decimal places allowed; 0 = whole number */
  decimals: number;
  /** Stored value = shown value / scale: a rate is shown in percent and stored as a fraction */
  scale: number;
  /** In the shown unit */
  defaultValue: number;
}

/** Sale settings read when a purchase order is created (GB-38). */
export interface PurchaseSettings {
  /** Commission rate s, a fraction (0.05 = 5%) */
  commissionRate: number;
  /** Delivery fee paid by the Buyer when the Seller sends the toy (VND) */
  shippingFee: number;
  /** The Seller ships within this many hours of the payment, or the order is cancelled */
  shipDeadlineHours: number;
  /** A shipped order completes by itself after this many days without confirmation or complaint */
  autoCompleteDays: number;
}

/** As implemented on develop (purchase-order.service.ts before UC30). */
export const DEFAULT_PURCHASE_SETTINGS: PurchaseSettings = {
  commissionRate: 0.05,
  shippingFee: 30_000,
  shipDeadlineHours: 48,
  autoCompleteDays: 7,
};

/** Amount of one withdrawal request (UC21), read when the request is created. */
export interface WithdrawalLimits {
  minAmount: number;
  maxAmount: number;
}

export const DEFAULT_WITHDRAWAL_LIMITS: WithdrawalLimits = {
  minAmount: WITHDRAWAL_LIMITS.MIN_AMOUNT,
  maxAmount: WITHDRAWAL_LIMITS.MAX_AMOUNT,
};

export const SETTING_KEYS = {
  rentalPlatformFeeRate: 'rental.platformFeeRate',
  rentalLateFeeMultiplier: 'rental.lateFeeMultiplier',
  rentalOwnerResponseHours: 'rental.ownerResponseHours',
  rentalPaymentHours: 'rental.paymentHours',
  rentalReceiptAutoConfirmHours: 'rental.receiptAutoConfirmHours',
  rentalSettlementHours: 'rental.settlementHours',
  rentalDisputeReplyHours: 'rental.disputeReplyHours',
  purchaseCommissionRate: 'purchase.commissionRate',
  purchaseShippingFee: 'purchase.shippingFee',
  purchaseShipDeadlineHours: 'purchase.shipDeadlineHours',
  purchaseAutoCompleteDays: 'purchase.autoCompleteDays',
  withdrawalMinAmount: 'withdrawal.minAmount',
  withdrawalMaxAmount: 'withdrawal.maxAmount',
  trustMinScore: 'rental.minTrustScore',
  trustDepositLimit: 'rental.trustDepositLimit',
  donationDecisionDays: DONATION_SETTING_KEYS.decisionDays,
  donationHandoverDays: DONATION_SETTING_KEYS.handoverDays,
  donationConfirmDays: DONATION_SETTING_KEYS.confirmDays,
} as const;

/** 0.1 → 10 (percent), without floating noise. */
const toPercent = (fraction: number) => Math.round(fraction * 10_000) / 100;

// Hours take up to 2 decimals from 0.01 (36 seconds), as develop accepted before UC30: the team
// shortens time limits on staging to test the scheduled jobs (R5.0 II.1, e.g. 0.1 hour = 6 minutes).
const HOURS = { unit: 'HOURS', min: 0.01, max: 168, decimals: 2, scale: 1 } as const;
const PERCENT = { unit: 'PERCENT', min: 0, max: 50, decimals: 2, scale: 100 } as const;
const DONATION_DAYS = {
  group: 'DONATION',
  unit: 'DAYS',
  min: 1,
  max: 90,
  decimals: 0,
  scale: 1,
} as const;
const NEW_RENTALS = 'Áp dụng cho yêu cầu thuê tạo sau khi lưu; đơn đã tạo giữ giá trị cũ.';
const NEW_PURCHASES = 'Áp dụng cho đơn mua tạo sau khi lưu; đơn đã tạo giữ giá trị cũ.';

export const SYSTEM_SETTINGS: readonly SettingDefinition[] = [
  {
    key: SETTING_KEYS.rentalPlatformFeeRate,
    group: 'RENTAL',
    label: 'Phí nền tảng đơn thuê',
    description: 'Phần trăm tiền thuê ToyFlow giữ lại, trừ vào tiền chủ đồ nhận khi quyết toán.',
    appliesTo: NEW_RENTALS,
    ...PERCENT,
    defaultValue: toPercent(DEFAULT_RENTAL_SETTINGS.platformFeeRate),
  },
  {
    key: SETTING_KEYS.rentalLateFeeMultiplier,
    group: 'RENTAL',
    label: 'Hệ số phí trả trễ',
    description:
      'Mỗi ngày trả trễ tính bằng giá thuê một ngày nhân hệ số này, tối đa bằng tiền cọc.',
    appliesTo: NEW_RENTALS,
    unit: 'MULTIPLIER',
    min: 0,
    max: 5,
    decimals: 2,
    scale: 1,
    defaultValue: DEFAULT_RENTAL_SETTINGS.lateFeeMultiplier,
  },
  {
    key: SETTING_KEYS.rentalOwnerResponseHours,
    group: 'RENTAL',
    label: 'Hạn chủ đồ phản hồi yêu cầu thuê',
    description: 'Chủ đồ không đồng ý hay từ chối trong thời hạn này thì yêu cầu thuê hết hạn.',
    appliesTo: NEW_RENTALS,
    ...HOURS,
    defaultValue: DEFAULT_RENTAL_SETTINGS.ownerResponseHours,
  },
  {
    key: SETTING_KEYS.rentalPaymentHours,
    group: 'RENTAL',
    label: 'Hạn thanh toán sau khi chủ đồ đồng ý',
    description: 'Người thuê không thanh toán trong thời hạn này thì đơn thuê bị huỷ.',
    appliesTo: NEW_RENTALS,
    ...HOURS,
    defaultValue: DEFAULT_RENTAL_SETTINGS.paymentHours,
  },
  {
    key: SETTING_KEYS.rentalReceiptAutoConfirmHours,
    group: 'RENTAL',
    label: 'Hạn người thuê xác nhận đã nhận đồ',
    description: 'Hết hạn mà người thuê chưa xác nhận thì hệ thống tự xác nhận đã nhận.',
    appliesTo: NEW_RENTALS,
    ...HOURS,
    defaultValue: DEFAULT_RENTAL_SETTINGS.receiptAutoConfirmHours,
  },
  {
    key: SETTING_KEYS.rentalSettlementHours,
    group: 'RENTAL',
    label: 'Hạn chủ đồ kiểm tra đồ trả về',
    description: 'Hết hạn mà chủ đồ chưa báo hư hỏng thì đơn được quyết toán là tốt.',
    appliesTo: NEW_RENTALS,
    ...HOURS,
    defaultValue: DEFAULT_RENTAL_SETTINGS.settlementHours,
  },
  {
    key: SETTING_KEYS.rentalDisputeReplyHours,
    group: 'RENTAL',
    label: 'Hạn phản hồi khiếu nại',
    description: 'Thời gian bên bị khiếu nại gửi giải thích trước khi Admin quyết định.',
    appliesTo: NEW_RENTALS,
    ...HOURS,
    defaultValue: DEFAULT_RENTAL_SETTINGS.disputeReplyHours,
  },
  {
    key: SETTING_KEYS.purchaseCommissionRate,
    group: 'PURCHASE',
    label: 'Hoa hồng đơn mua',
    description: 'Phần trăm giá món ToyFlow giữ lại, trừ vào tiền người bán nhận.',
    appliesTo: NEW_PURCHASES,
    ...PERCENT,
    defaultValue: toPercent(DEFAULT_PURCHASE_SETTINGS.commissionRate),
  },
  {
    key: SETTING_KEYS.purchaseShippingFee,
    group: 'PURCHASE',
    label: 'Phí giao tận nơi',
    description: 'Người mua trả thêm khi chọn giao tận nơi; người bán nhận lại để tự gửi hàng.',
    appliesTo: NEW_PURCHASES,
    unit: 'VND',
    min: 0,
    max: 1_000_000,
    decimals: 0,
    scale: 1,
    defaultValue: DEFAULT_PURCHASE_SETTINGS.shippingFee,
  },
  {
    key: SETTING_KEYS.purchaseShipDeadlineHours,
    group: 'PURCHASE',
    label: 'Hạn người bán gửi hàng',
    description:
      'Người bán không gửi hàng trong thời hạn này thì đơn tự huỷ và hoàn tiền người mua.',
    appliesTo: NEW_PURCHASES,
    ...HOURS,
    defaultValue: DEFAULT_PURCHASE_SETTINGS.shipDeadlineHours,
  },
  {
    key: SETTING_KEYS.purchaseAutoCompleteDays,
    group: 'PURCHASE',
    label: 'Tự hoàn tất đơn mua sau khi gửi',
    description:
      'Người mua không xác nhận hay khiếu nại trong thời hạn này thì tiền chuyển cho người bán.',
    appliesTo: NEW_PURCHASES,
    unit: 'DAYS',
    min: 1,
    max: 30,
    decimals: 0,
    scale: 1,
    defaultValue: DEFAULT_PURCHASE_SETTINGS.autoCompleteDays,
  },
  {
    key: SETTING_KEYS.withdrawalMinAmount,
    group: 'WALLET',
    label: 'Số tiền rút tối thiểu',
    description: 'Số tiền nhỏ nhất của một lệnh rút. Không được lớn hơn số tiền rút tối đa.',
    appliesTo: 'Áp dụng cho lệnh rút tạo sau khi lưu; lệnh đang chờ không đổi.',
    unit: 'VND',
    min: 1_000,
    max: 100_000_000,
    decimals: 0,
    scale: 1,
    defaultValue: DEFAULT_WITHDRAWAL_LIMITS.minAmount,
  },
  {
    key: SETTING_KEYS.withdrawalMaxAmount,
    group: 'WALLET',
    label: 'Số tiền rút tối đa mỗi lần',
    description: 'Số tiền lớn nhất của một lệnh rút. Không được nhỏ hơn số tiền rút tối thiểu.',
    appliesTo: 'Áp dụng cho lệnh rút tạo sau khi lưu; lệnh đang chờ không đổi.',
    unit: 'VND',
    min: 1_000,
    max: 1_000_000_000,
    decimals: 0,
    scale: 1,
    defaultValue: DEFAULT_WITHDRAWAL_LIMITS.maxAmount,
  },
  {
    key: SETTING_KEYS.trustMinScore,
    group: 'TRUST',
    label: 'Ngưỡng Trust Score',
    description:
      'Người thuê có Trust Score dưới ngưỡng này không thuê được đồ chơi có tiền cọc trên mức cọc bên dưới (GB-29).',
    appliesTo: 'Áp dụng cho yêu cầu thuê gửi sau khi lưu; yêu cầu đã gửi không bị chặn lại.',
    unit: 'POINTS',
    min: 0,
    max: 100,
    decimals: 0,
    scale: 1,
    defaultValue: DEFAULT_RENTAL_SETTINGS.minTrustScore,
  },
  {
    key: SETTING_KEYS.trustDepositLimit,
    group: 'TRUST',
    label: 'Mức cọc áp dụng ngưỡng',
    description: 'Ngưỡng Trust Score chỉ áp dụng cho đồ chơi có tiền cọc lớn hơn mức này.',
    appliesTo: 'Áp dụng cho yêu cầu thuê gửi sau khi lưu; yêu cầu đã gửi không bị chặn lại.',
    unit: 'VND',
    min: 0,
    max: 100_000_000,
    decimals: 0,
    scale: 1,
    defaultValue: DEFAULT_RENTAL_SETTINGS.trustDepositLimit,
  },
  {
    key: SETTING_KEYS.donationDecisionDays,
    label: 'Hạn duyệt yêu cầu quyên góp',
    description: 'Yêu cầu Chờ duyệt quá thời hạn này thì hết hạn (GB-57).',
    appliesTo: 'Áp dụng cho yêu cầu quyên góp gửi sau khi lưu.',
    ...DONATION_DAYS,
    defaultValue: DEFAULT_DONATION_SETTINGS.decisionDays,
  },
  {
    key: SETTING_KEYS.donationHandoverDays,
    label: 'Hạn gửi đồ quyên góp',
    description:
      'Yêu cầu đã chấp nhận mà người tặng không gửi đồ trong thời hạn này thì hết hạn (GB-57).',
    appliesTo: 'Áp dụng cho yêu cầu được chấp nhận sau khi lưu.',
    ...DONATION_DAYS,
    defaultValue: DEFAULT_DONATION_SETTINGS.handoverDays,
  },
  {
    key: SETTING_KEYS.donationConfirmDays,
    label: 'Hạn tổ chức xác nhận đã nhận',
    description:
      'Yêu cầu đang gửi quá thời hạn này mà tổ chức chưa xác nhận thì được đánh dấu quá hạn cho Admin, không tự xác nhận (GB-57).',
    appliesTo: 'Dấu quá hạn tính lại theo giá trị mới cho mọi yêu cầu đang gửi.',
    ...DONATION_DAYS,
    defaultValue: DEFAULT_DONATION_SETTINGS.confirmDays,
  },
];

const definitionsByKey = new Map(SYSTEM_SETTINGS.map((definition) => [definition.key, definition]));

export const findSettingDefinition = (key: string): SettingDefinition | undefined =>
  definitionsByKey.get(key);
