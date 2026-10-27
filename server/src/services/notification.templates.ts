import type { StoredDonationStatus } from '../models/donation-request.model.js';
import type {
  DonationStatusChangedEvent,
  IdentityReviewedEvent,
  ToyReviewedEvent,
} from '../utils/domain-events.js';
import { renderEmail, type EmailContent, type EmailSpec } from './notification.email.js';
import type { NotificationType } from '../constants/notification-types.js';

type DonationStatus = StoredDonationStatus;

/** What a notification is about; only used for the link in the email (not stored). */
export type NotificationTargetKind = 'TOY' | 'IDENTITY_VERIFICATION' | 'DONATION_REQUEST';

// Vietnamese texts of every notification (in-app title/body + email). Pure functions, so the
// content is unit-tested without a database. The notification `type` is the shared event name;
// the decision lives in the title and body.

export interface NotificationTarget {
  kind: NotificationTargetKind;
  id: string;
}

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  body: string;
  target: NotificationTarget;
  email: EmailContent;
}

export interface TemplateContext {
  appPublicUrl: string;
  organizationName?: string | undefined;
}

// Pages of the user web app a notification opens (the email needs a full URL).
const targetPaths: Partial<Record<NotificationTargetKind, (id: string) => string>> = {
  TOY: (id) => `/my/listings/${id}`,
  IDENTITY_VERIFICATION: () => '/account/identity',
  DONATION_REQUEST: (id) => `/my/donations/${id}`,
};

export const targetUrl = (target: NotificationTarget, appPublicUrl: string): string =>
  `${appPublicUrl.replace(/\/+$/, '')}${targetPaths[target.kind]?.(target.id) ?? '/'}`;

const MAX_NAME = 80;
const MAX_TITLE = 200;
const MAX_BODY = 1000;

const shorten = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const asSentence = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`);

interface MessageSpec extends Omit<EmailSpec, 'action'> {
  type: NotificationType;
  target: NotificationTarget;
  actionLabel: string;
}

const buildMessage = (spec: MessageSpec, appPublicUrl: string): NotificationMessage => {
  const reason = spec.reason?.trim() ? asSentence(spec.reason.trim()) : undefined;
  const title = shorten(spec.title, MAX_TITLE);
  const body = [spec.summary, ...(reason ? [`Lý do: ${reason}`] : []), spec.nextStep].join(' ');
  return {
    type: spec.type,
    title,
    body: shorten(body, MAX_BODY),
    target: spec.target,
    email: renderEmail({
      title,
      summary: spec.summary,
      reason,
      nextStep: spec.nextStep,
      action: { label: spec.actionLabel, url: targetUrl(spec.target, appPublicUrl) },
    }),
  };
};

export const renderToyReviewed = (
  event: ToyReviewedEvent,
  context: TemplateContext,
): NotificationMessage => {
  const name = shorten(event.toyTitle, MAX_NAME);
  const base = { type: 'TOY_REVIEWED', target: { kind: 'TOY', id: event.toyId } } as const;
  return buildMessage(
    event.decision === 'approved'
      ? {
          ...base,
          title: `Tin đăng "${name}" đã được duyệt`,
          summary: `Tin đăng "${event.toyTitle}" của bạn đã được Admin duyệt và đang hiển thị trên ToyFlow.`,
          nextStep: 'Người dùng khác đã có thể tìm thấy đồ chơi và gửi yêu cầu cho bạn.',
          actionLabel: 'Xem tin đăng',
        }
      : {
          ...base,
          title: `Tin đăng "${name}" chưa được duyệt`,
          summary: `Tin đăng "${event.toyTitle}" của bạn chưa được Admin duyệt.`,
          reason: event.reason,
          nextStep: 'Vui lòng chỉnh sửa tin đăng theo góp ý của Admin rồi gửi lại để được duyệt.',
          actionLabel: 'Chỉnh sửa tin đăng',
        },
    context.appPublicUrl,
  );
};

export const renderIdentityReviewed = (
  event: IdentityReviewedEvent,
  context: TemplateContext,
): NotificationMessage => {
  const base = {
    type: 'IDENTITY_REVIEWED',
    target: { kind: 'IDENTITY_VERIFICATION', id: event.verificationId },
  } as const;
  return buildMessage(
    event.decision === 'verified'
      ? {
          ...base,
          title: 'Danh tính của bạn đã được xác minh',
          summary: 'Admin đã kiểm tra và xác minh danh tính tài khoản ToyFlow của bạn.',
          nextStep: 'Từ bây giờ bạn có thể dùng các chức năng dành cho tài khoản đã xác minh.',
          actionLabel: 'Xem trạng thái xác minh',
        }
      : {
          ...base,
          title: 'Yêu cầu xác minh danh tính chưa được chấp nhận',
          summary: 'Admin chưa thể xác minh danh tính của bạn với các ảnh đã gửi.',
          reason: event.reason,
          nextStep:
            'Vui lòng gửi yêu cầu mới với ảnh rõ nét mặt trước, mặt sau CCCD và ảnh chân dung.',
          actionLabel: 'Gửi yêu cầu xác minh mới',
        },
    context.appPublicUrl,
  );
};

export type DonationParty = 'DONOR' | 'REQUESTER';

// Who hears about each new status. The user who made the change is not notified.
export const donationAudience: Record<DonationStatus, readonly DonationParty[]> = {
  pending: ['DONOR'],
  accepted: ['REQUESTER', 'DONOR'],
  rejected: ['REQUESTER', 'DONOR'],
  shipping: ['REQUESTER'],
  // Not used by the donor flow (confirming receipt completes the request).
  received: [],
  completed: ['DONOR', 'REQUESTER'],
  cancelled: ['DONOR', 'REQUESTER'],
};

// For an ORGANIZATION request, requestedBy is only the Admin who filed it on the
// organization's behalf, so the requester side is the Admin team as a whole: `adminIds` (every
// active Admin) replaces requestedBy. Organizations have no account of their own to notify.
export const donationRecipients = (
  event: DonationStatusChangedEvent,
  adminIds: readonly string[] = [],
): Array<{ party: DonationParty; userId: string }> =>
  donationAudience[event.to]
    .flatMap((party): Array<{ party: DonationParty; userId: string }> => {
      if (party === 'DONOR') return [{ party, userId: event.donorId }];
      if (event.receiverType === 'ORGANIZATION')
        return adminIds.map((userId) => ({ party, userId }));
      return [{ party, userId: event.requestedBy }];
    })
    .filter(({ userId }) => userId !== event.changedBy);

/** Whether the recipients of this event include the Admin team (see donationRecipients). */
export const donationNeedsAdmins = (event: DonationStatusChangedEvent): boolean =>
  event.receiverType === 'ORGANIZATION' && donationAudience[event.to].includes('REQUESTER');

type DonationText = Pick<MessageSpec, 'title' | 'summary' | 'nextStep' | 'actionLabel'>;

const VIEW_REQUEST = 'Xem yêu cầu quyên góp';

const donationTexts = (
  status: DonationStatus,
  party: DonationParty,
  toy: string,
  name: string,
  receiver: string,
): DonationText => {
  const forDonor = party === 'DONOR';
  switch (status) {
    case 'pending':
      return {
        title: `Có yêu cầu nhận đồ chơi "${name}"`,
        summary: `Bạn nhận được một yêu cầu nhận đồ chơi quyên góp "${toy}"${receiver}.`,
        nextStep: 'Vui lòng xem yêu cầu và chấp nhận hoặc từ chối trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    case 'accepted':
      return forDonor
        ? {
            title: `Yêu cầu nhận "${name}" đã được chấp nhận`,
            summary: `Admin đã chấp nhận yêu cầu nhận đồ chơi "${toy}"${receiver}.`,
            nextStep: 'Vui lòng chuẩn bị đồ chơi và tải ảnh bàn giao lên ToyFlow khi gửi đi.',
            actionLabel: VIEW_REQUEST,
          }
        : {
            title: `Yêu cầu nhận "${name}" đã được chấp nhận`,
            summary: `Yêu cầu nhận đồ chơi "${toy}"${receiver} của bạn đã được chấp nhận.`,
            nextStep:
              'Người quyên góp sẽ chuẩn bị và gửi đồ chơi; bạn sẽ được báo khi đồ chơi được gửi.',
            actionLabel: VIEW_REQUEST,
          };
    case 'rejected':
      return {
        title: `Yêu cầu nhận "${name}" không được chấp nhận`,
        summary: forDonor
          ? `Admin đã từ chối yêu cầu nhận đồ chơi "${toy}"${receiver}.`
          : `Yêu cầu nhận đồ chơi "${toy}"${receiver} của bạn không được chấp nhận.`,
        nextStep: 'Bạn có thể xem chi tiết yêu cầu trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    case 'shipping':
      return {
        title: `Đồ chơi "${name}" đã được gửi đi`,
        summary: `Người quyên góp đã gửi đồ chơi "${toy}"${receiver}.`,
        nextStep: 'Khi nhận được đồ chơi, vui lòng xác nhận đã nhận trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    case 'received':
    case 'completed':
      return forDonor
        ? {
            title: `Cảm ơn bạn đã quyên góp "${name}"`,
            summary: `Đồ chơi "${toy}" bạn quyên góp đã được trao${receiver} thành công.`,
            nextStep:
              'ToyFlow chân thành cảm ơn tấm lòng của bạn. Món quà sẽ mang thêm niềm vui cho các em nhỏ.',
            actionLabel: 'Xem chi tiết quyên góp',
          }
        : {
            title: `Đã hoàn tất nhận đồ chơi "${name}"`,
            summary: `Việc nhận đồ chơi quyên góp "${toy}"${receiver} đã hoàn tất.`,
            nextStep: 'Cảm ơn bạn đã sử dụng ToyFlow.',
            actionLabel: VIEW_REQUEST,
          };
    case 'cancelled':
      return {
        title: `Yêu cầu nhận "${name}" đã bị hủy`,
        summary: `Yêu cầu nhận đồ chơi quyên góp "${toy}"${receiver} đã bị hủy.`,
        nextStep: 'Bạn có thể xem chi tiết yêu cầu trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
  }
};

export const renderDonationStatusChanged = (
  event: DonationStatusChangedEvent,
  party: DonationParty,
  context: TemplateContext,
): NotificationMessage => {
  const organization = context.organizationName?.trim();
  const receiver = organization ? ` cho ${organization}` : '';
  return buildMessage(
    {
      type: 'DONATION_STATUS_CHANGED',
      target: { kind: 'DONATION_REQUEST', id: event.donationRequestId },
      reason: event.to === 'rejected' || event.to === 'cancelled' ? event.reason : undefined,
      ...donationTexts(
        event.to,
        party,
        event.toyTitle,
        shorten(event.toyTitle, MAX_NAME),
        receiver,
      ),
    },
    context.appPublicUrl,
  );
};
