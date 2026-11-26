import { describe, expect, it } from 'vitest';

import {
  trustBlockKeptNotice,
  trustBlockLiftedNotice,
} from '../src/services/account-moderation.notices.js';

// Vietnamese notices of the Admin's Trust Score decisions (UC29, FE-09). ACCOUNT type, so an
// email copy is sent too (notificationTypeRules).
describe('Trust Score decision notices', () => {
  it('tells a lifted Renter the score the lift holds at and opens the toy', () => {
    const notice = trustBlockLiftedNotice('u1', 35, '  Đã xác minh qua điện thoại  ', 't1');
    expect(notice).toMatchObject({
      type: 'ACCOUNT',
      to: 'u1',
      title: 'Bạn đã được gỡ chặn thuê đồ chơi có tiền cọc cao',
      link: '/toys/t1',
    });
    expect(notice.body).toBe(
      'Admin đã xem xét và cho phép bạn đặt thuê đồ chơi có tiền cọc cao dù điểm tin cậy của bạn là 35. ' +
        'Lý do: Đã xác minh qua điện thoại. ' +
        'Việc gỡ chặn còn hiệu lực khi điểm tin cậy của bạn không thấp hơn 35.',
    );
    expect(trustBlockLiftedNotice('u1', 35, 'Lý do.', undefined).link).toBeUndefined();
  });

  it('tells a kept Renter the threshold and the deposit limit in VND', () => {
    const notice = trustBlockKeptNotice('u1', {
      threshold: 50,
      depositLimit: 500_000,
      reason: 'Hai lần trả đồ trễ gần đây!',
      liftRevoked: false,
    });
    expect(notice.title).toBe('Bạn vẫn chưa thể thuê đồ chơi có tiền cọc cao');
    expect(notice.body).toContain(
      'Admin đã xem xét và giữ giới hạn: khi điểm tin cậy dưới 50, bạn chưa thể thuê đồ chơi có tiền cọc trên 500.000 đ.',
    );
    expect(notice.body).toContain('Lý do: Hai lần trả đồ trễ gần đây!');
    expect(notice.link).toBeUndefined();

    const revoked = trustBlockKeptNotice('u1', {
      threshold: 70,
      depositLimit: 1_000_000,
      reason: 'Điểm giảm sau khiếu nại',
      liftRevoked: true,
    });
    expect(revoked.title).toBe('Admin đã áp dụng lại chặn thuê đồ chơi có tiền cọc cao');
    expect(revoked.body).toContain('áp dụng lại giới hạn: khi điểm tin cậy dưới 70');
    expect(revoked.body).toContain('1.000.000 đ');
  });
});
