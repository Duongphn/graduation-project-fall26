import type { LockDuration, ReportAction } from '../constants/violation-report.js';
import type { NotificationType } from '../constants/notification-types.js';
import { notify } from '../utils/notify.js';
import { notificationLinks } from './notification.links.js';

// Notifications of the Admin's account and report decisions (UC29), sent through the shared
// notify() after the decision has committed. ACCOUNT also sends an email copy (R03 API-01: the
// lock reason reaches the user by email); VIOLATION_REPORT tells reporters the outcome.

export interface AccountNotice {
  type: NotificationType;
  to: string;
  title: string;
  body: string;
  link?: string;
}

/** "25/11/2026 18:00" in Vietnam time. */
export const formatVietnamTime = (date: Date): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
};

const asSentence = (text: string): string => {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const lockLength = (duration: LockDuration, until: Date | null): string =>
  duration === 'permanent' || !until ? 'vĩnh viễn' : `đến ${formatVietnamTime(until)}`;

export const accountLockedNotice = (
  userId: string,
  duration: LockDuration,
  until: Date | null,
  reason: string,
): AccountNotice => ({
  type: 'ACCOUNT',
  to: userId,
  title: 'Tài khoản của bạn đã bị khóa',
  body:
    `Admin đã khóa tài khoản ToyFlow của bạn ${lockLength(duration, until)}. Lý do: ${asSentence(reason)} ` +
    'Các tin đăng đang hiển thị đã được ẩn và bạn không thể đăng nhập hay rút tiền trong thời gian khóa. ' +
    'Các đơn đang thực hiện vẫn tiếp tục đến khi hoàn tất và tiền đang giữ của bạn không bị mất.',
});

export const accountUnlockedNotice = (userId: string, reason: string | undefined): AccountNotice => ({
  type: 'ACCOUNT',
  to: userId,
  title: 'Tài khoản của bạn đã được mở khóa',
  body:
    'Tài khoản ToyFlow của bạn đã được mở khóa và các tin đăng bị ẩn do khóa đã hiển thị lại.' +
    (reason ? ` Lý do: ${asSentence(reason)}` : '') +
    ' Bạn có thể đăng nhập và sử dụng ToyFlow như bình thường.',
  link: notificationLinks.myListings(),
});

const vnd = (amount: number): string => `${amount.toLocaleString('vi-VN')} đ`;

/** UC29, FE-09: the Admin lifted the Trust Score block; the link opens the toy the Renter wanted. */
export const trustBlockLiftedNotice = (
  userId: string,
  score: number,
  reason: string,
  toyId: string | undefined,
): AccountNotice => ({
  type: 'ACCOUNT',
  to: userId,
  title: 'Bạn đã được gỡ chặn thuê đồ chơi có tiền cọc cao',
  body:
    `Admin đã xem xét và cho phép bạn đặt thuê đồ chơi có tiền cọc cao dù điểm tin cậy của bạn là ${score}. ` +
    `Lý do: ${asSentence(reason)} ` +
    `Việc gỡ chặn còn hiệu lực khi điểm tin cậy của bạn không thấp hơn ${score}.`,
  ...(toyId ? { link: notificationLinks.toyDetail(toyId) } : {}),
});

/** UC29, FE-09: the Admin kept the block, or put it back after a lift (`liftRevoked`). */
export const trustBlockKeptNotice = (
  userId: string,
  input: { threshold: number; depositLimit: number; reason: string; liftRevoked: boolean },
): AccountNotice => ({
  type: 'ACCOUNT',
  to: userId,
  title: input.liftRevoked
    ? 'Admin đã áp dụng lại chặn thuê đồ chơi có tiền cọc cao'
    : 'Bạn vẫn chưa thể thuê đồ chơi có tiền cọc cao',
  body:
    `Admin đã xem xét và ${input.liftRevoked ? 'áp dụng lại' : 'giữ'} giới hạn: khi điểm tin cậy dưới ` +
    `${input.threshold}, bạn chưa thể thuê đồ chơi có tiền cọc trên ${vnd(input.depositLimit)}. ` +
    `Lý do: ${asSentence(input.reason)} ` +
    'Bạn vẫn thuê được đồ chơi có tiền cọc thấp hơn; trả đồ đúng hẹn và nhận đánh giá tốt sẽ giúp tăng điểm tin cậy.',
});

export const accountWarnedNotice = (userId: string, note: string): AccountNotice => ({
  type: 'ACCOUNT',
  to: userId,
  title: 'Cảnh cáo vi phạm quy định ToyFlow',
  body:
    `Admin đã xác nhận một báo cáo vi phạm về tài khoản hoặc nội dung của bạn. Lý do: ${asSentence(note)} ` +
    'Nếu tiếp tục vi phạm, tài khoản của bạn có thể bị khóa.',
});

export const listingRemovedNotice = (userId: string, toyTitle: string, note: string): AccountNotice => ({
  type: 'TOY_REVIEWED',
  to: userId,
  title: `Tin đăng "${toyTitle.slice(0, 80)}" đã bị gỡ`,
  body:
    `Admin đã gỡ tin đăng "${toyTitle}" sau khi xem xét báo cáo vi phạm. Lý do: ${asSentence(note)} ` +
    'Đơn đang thực hiện với đồ chơi này vẫn tiếp tục. Bạn có thể sửa tin và gửi duyệt lại.',
  link: notificationLinks.myListings(),
});

const outcomeText: Record<ReportAction, string> = {
  dismiss: 'Admin đã xem xét và không thấy vi phạm.',
  remove_listing: 'Admin đã xác nhận vi phạm và gỡ tin đăng.',
  warn: 'Admin đã xác nhận vi phạm và cảnh cáo người dùng liên quan.',
  lock: 'Admin đã xác nhận vi phạm và khóa tài khoản liên quan.',
};

export const reportHandledNotice = (userId: string, action: ReportAction): AccountNotice => ({
  type: 'VIOLATION_REPORT',
  to: userId,
  title: 'Báo cáo vi phạm của bạn đã được xử lý',
  body: `Cảm ơn bạn đã báo cáo. ${outcomeText[action]}`,
});

/** Hands every notice to notify(); delivery runs in the background and never fails the action. */
export const sendNotices = (notices: AccountNotice[], actorId?: string): void => {
  for (const notice of notices) {
    notify({ ...notice, ...(actorId ? { actorId } : {}) });
  }
};
