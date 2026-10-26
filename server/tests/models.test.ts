import { describe, expect, it } from 'vitest';

import * as models from '../src/models/index.js';

describe('models index', () => {
  it('registers OrderStatusHistory with the order_timeline index', () => {
    expect(models.OrderStatusHistory.modelName).toBe('OrderStatusHistory');
    const names = models.OrderStatusHistory.schema.indexes().map(([, options]) => options.name);
    expect(names).toContain('order_timeline');
  });

  it('exports every collection model under its registered name', () => {
    const expected = [
      'AiRequest',
      'AuditLog',
      'Category',
      'Conversation',
      'Dispute',
      'DonationRequest',
      'IdentityVerification',
      'Message',
      'Notification',
      'OrderStatusHistory',
      'Organization',
      'OtpRequest',
      'Payment',
      'PurchaseOrder',
      'RefreshToken',
      'RentalOrder',
      'SystemSetting',
      'Toy',
      'User',
      'ViolationReport',
      'Voucher',
      'Wallet',
      'WalletTransaction',
      'WithdrawalRequest',
    ];

    for (const name of expected) {
      const model = (models as Record<string, { modelName?: string }>)[name];
      expect(model?.modelName, name).toBe(name);
    }
  });
});
