import { AppError } from '../utils/app-error.js';

export interface TopupInput {
  amount: number;
  bankCode?: string | undefined;
}

export function validateTopupInput(body: unknown): TopupInput {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'INVALID_INPUT', 'Request body must be an object.');
  }

  const { amount, bankCode } = body as Record<string, unknown>;

  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Số tiền nạp phải là số nguyên hợp lệ.');
  }

  if (amount < 10_000) {
    throw new AppError(400, 'AMOUNT_TOO_LOW', 'Số tiền nạp tối thiểu là 10.000 VNĐ.');
  }

  if (amount > 100_000_000) {
    throw new AppError(400, 'AMOUNT_TOO_HIGH', 'Số tiền nạp tối đa mỗi lần là 100.000.000 VNĐ.');
  }

  const result: TopupInput = { amount };

  if (bankCode !== undefined && bankCode !== null) {
    if (typeof bankCode !== 'string' || !bankCode.trim()) {
      throw new AppError(400, 'INVALID_BANK_CODE', 'Mã ngân hàng không hợp lệ.');
    }
    result.bankCode = bankCode.trim();
  }

  return result;
}

