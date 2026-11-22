import { env } from '../config/env.js';
import type { LockDuration, ReportAction } from '../constants/violation-report.js';
import { renderEmail } from './notification.email.js';
import { createNotifier, describeError } from './notification.service.js';
import type { NotificationMessage } from './notification.templates.js';

// In-app notifications + email copies of the Admin's account and report decisions (UC29). Sent
// through the shared notifier after the decision has committed; a failure is only logged.

/** notifications.type values written by this module. */
export const accountNoticeTypes = [
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'ACCOUNT_WARNED',
  'LISTING_REMOVED',
  'VIOLATION_REPORT_HANDLED',
] as const;
export type AccountNoticeType = (typeof accountNoticeTypes)[number];

const appUrl = (path: string) =>
  `${(process.env.APP_PUBLIC_URL?.trim() || env.corsOrigin).replace(/\/+$/, '')}${path}`;

const asSentence = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`);

interface NoticeSpec {
  type: AccountNoticeType;
  title: string;
  summary: string;
  reason?: string | undefined;
  nextStep: string;
  action: { label: string; path: string };
}

const buildNotice = (spec: NoticeSpec): NotificationMessage => {
  const reason = spec.reason?.trim() ? asSentence(spec.reason.trim()) : undefined;
  return {
    // The notification feature's type list does not name these types yet (follow-up); the
    // notifier stores any string.
    type: spec.type as unknown as NotificationMessage['type'],
    title: spec.title,
    body: [spec.summary, ...(reason ? [`Lý do: ${reason}`] : []), spec.nextStep].join(' '),
    link: spec.action.path,
    email: renderEmail({
      title: spec.title,
      summary: spec.summary,
      reason,
      nextStep: spec.nextStep,
      action: { label: spec.action.label, url: appUrl(spec.action.path) },
    }),
  };
};

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

const lockLength = (duration: LockDuration, until: Date | null): string =>
  duration === 'permanent' || !until ? 'vĩnh viễn' : `đến ${formatVietnamTime(until)}`;

export const accountLockedNotice = (duration: LockDuration, until: Date | null, reason: string) =>
  buildNotice({
    type: 'ACCOUNT_LOCKED',
    title: 'Tài khoản của bạn đã bị khóa',
    summary: `Admin đã khóa tài khoản ToyFlow của bạn ${lockLength(duration, until)}. Các tin đăng đang hiển thị đã được ẩn và bạn không thể đăng nhập hay rút tiền trong thời gian khóa.`,
    reason,
    nextStep:
      'Các đơn thuê, đơn mua đang thực hiện vẫn tiếp tục đến khi hoàn tất và tiền đang giữ của bạn không bị mất.',
    action: { label: 'Xem điều khoản ToyFlow', path: '/terms' },
  });

export const accountUnlockedNotice = (reason: string | undefined) =>
  buildNotice({
    type: 'ACCOUNT_UNLOCKED',
    title: 'Tài khoản của bạn đã được mở khóa',
    summary: 'Tài khoản ToyFlow của bạn đã được mở khóa. Các tin đăng bị ẩn do khóa tài khoản đã hiển thị lại.',
    reason,
    nextStep: 'Bạn có thể đăng nhập và sử dụng ToyFlow như bình thường.',
    action: { label: 'Đăng nhập', path: '/login' },
  });

export const accountWarnedNotice = (note: string) =>
  buildNotice({
    type: 'ACCOUNT_WARNED',
    title: 'Cảnh cáo vi phạm quy định ToyFlow',
    summary: 'Admin đã xác nhận một báo cáo vi phạm về tài khoản hoặc nội dung của bạn.',
    reason: note,
    nextStep: 'Nếu tiếp tục vi phạm, tài khoản của bạn có thể bị khóa.',
    action: { label: 'Xem điều khoản ToyFlow', path: '/terms' },
  });

export const listingRemovedNotice = (toyTitle: string, note: string) =>
  buildNotice({
    type: 'LISTING_REMOVED',
    title: `Tin đăng "${toyTitle.slice(0, 80)}" đã bị gỡ`,
    summary: `Admin đã gỡ tin đăng "${toyTitle}" sau khi xem xét báo cáo vi phạm.`,
    reason: note,
    nextStep: 'Đơn đang thực hiện với đồ chơi này vẫn tiếp tục. Bạn có thể sửa tin và gửi duyệt lại.',
    action: { label: 'Xem tin đăng của tôi', path: '/listings' },
  });

const outcomeText: Record<ReportAction, string> = {
  dismiss: 'Admin đã xem xét và không thấy vi phạm.',
  remove_listing: 'Admin đã xác nhận vi phạm và gỡ tin đăng.',
  warn: 'Admin đã xác nhận vi phạm và cảnh cáo người dùng liên quan.',
  lock: 'Admin đã xác nhận vi phạm và khóa tài khoản liên quan.',
};

export const reportHandledNotice = (action: ReportAction) =>
  buildNotice({
    type: 'VIOLATION_REPORT_HANDLED',
    title: 'Báo cáo vi phạm của bạn đã được xử lý',
    summary: `Cảm ơn bạn đã báo cáo. ${outcomeText[action]}`,
    nextStep: 'Bạn có thể tiếp tục báo cáo khi thấy nội dung vi phạm.',
    action: { label: 'Về ToyFlow', path: '/' },
  });

/** Sends every notice; never throws (the decision has already committed). */
export const sendNotices = async (
  notices: Array<{ userId: string; message: NotificationMessage }>,
): Promise<void> => {
  const notifier = createNotifier();
  const results = await Promise.allSettled(
    notices.map(({ userId, message }) => notifier.notifyUser(userId, message)),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `[notifications] ${notices[index]?.message.type} not delivered: ${describeError(result.reason)}`,
      );
    }
  });
};
