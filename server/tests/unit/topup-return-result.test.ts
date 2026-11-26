import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { PaymentRecord } from '../../src/repositories/payment.repository.js';
import { toReturnResult } from '../../src/services/topup-settlement.js';

const failed = (gatewayResponseCode?: string) =>
  ({
    code: '123456',
    userId: new Types.ObjectId(),
    amount: 200_000,
    status: 'failed',
    ...(gatewayResponseCode !== undefined ? { gatewayResponseCode } : {}),
  }) as unknown as PaymentRecord;

// E2E 26/11 bug 5: PayOS stores 'EXPIRED', the expiry job 'expired'; both mean the link expired
describe('toReturnResult: failed top-up messages', () => {
  it.each(['EXPIRED', 'expired', 'Expired'])('code %s: "đã hết hạn"', (code) => {
    expect(toReturnResult(failed(code))).toMatchObject({
      success: false,
      status: 'failed',
      message: 'Giao dịch nạp tiền đã hết hạn.',
    });
  });

  it.each(['FAILED', 'link_error', undefined])('code %s: "thất bại"', (code) => {
    expect(toReturnResult(failed(code)).message).toBe('Giao dịch nạp tiền thất bại.');
  });

  it('a cancelled link stays "cancelled"', () => {
    expect(toReturnResult(failed('CANCELLED'))).toMatchObject({ status: 'cancelled' });
  });
});
