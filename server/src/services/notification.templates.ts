import type { StoredDonationStatus } from '../models/donation-request.model.js';
import type {
  DonationStatusChangedEvent,
  IdentityReviewedEvent,
  NotifyEvent,
  ToyReviewedEvent,
} from '../utils/domain-events.js';
import { renderEmail, type EmailContent, type EmailSpec } from './notification.email.js';
import { absoluteUrl, isAppLink, notificationLinks } from './notification.links.js';
import { notificationTypeRules, type NotificationType } from '../constants/notification-types.js';
import { formatVietnamDate } from '../utils/dates.js';
import { SIBLING_REJECT_REASON } from './donation-request.policy.js';

type DonationStatus = StoredDonationStatus;

// Vietnamese texts of every notification (in-app title/body + email). Pure functions, so the
// content is unit-tested without a database. The notification `type` is the shared event name;
// the decision lives in the title and body.

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  body: string;
  /** App path the notification opens (notifications.link). */
  link?: string;
  /** Set for important events only (notificationTypeRules[type].email or the caller's choice). */
  email?: EmailContent;
}

export interface TemplateContext {
  appPublicUrl: string;
  organizationName?: string | undefined;
}

const MAX_NAME = 80;
const MAX_TITLE = 200;
const MAX_BODY = 1000;

const shorten = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const asSentence = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`);

interface MessageSpec extends Omit<EmailSpec, 'action'> {
  type: NotificationType;
  link: string;
  actionLabel: string;
}

const buildMessage = (
  spec: MessageSpec,
  appPublicUrl: string,
  sendEmail = notificationTypeRules[spec.type].email,
): NotificationMessage => {
  const reason = spec.reason?.trim() ? asSentence(spec.reason.trim()) : undefined;
  const title = shorten(spec.title, MAX_TITLE);
  const body = [spec.summary, ...(reason ? [`Lý do: ${reason}`] : []), spec.nextStep]
    .filter(Boolean)
    .join(' ');
  return {
    type: spec.type,
    title,
    body: shorten(body, MAX_BODY),
    link: spec.link,
    ...(sendEmail
      ? {
          email: renderEmail({
            title,
            summary: spec.summary,
            reason,
            nextStep: spec.nextStep,
            action: { label: spec.actionLabel, url: absoluteUrl(spec.link, appPublicUrl) },
          }),
        }
      : {}),
  };
};

/** A notification emitted through notify(): the caller wrote the title and body. */
export const renderNotify = (
  event: Pick<NotifyEvent, 'notificationType' | 'title' | 'body' | 'link' | 'email'>,
  context: TemplateContext,
): NotificationMessage => {
  const link = isAppLink(event.link) ? event.link : undefined;
  const message = buildMessage(
    {
      type: event.notificationType,
      title: event.title.trim(),
      summary: event.body.trim(),
      nextStep: '',
      link: link ?? '/',
      actionLabel: link ? 'Xem chi tiết' : 'Mở ToyFlow',
    },
    context.appPublicUrl,
    event.email ?? notificationTypeRules[event.notificationType].email,
  );
  if (!link) delete message.link;
  return message;
};

export const renderToyReviewed = (
  event: ToyReviewedEvent,
  context: TemplateContext,
): NotificationMessage => {
  const name = shorten(event.toyTitle, MAX_NAME);
  const base = { type: 'TOY_REVIEWED' } as const;
  return buildMessage(
    event.decision === 'approved'
      ? {
          ...base,
          link: notificationLinks.toyDetail(event.toyId),
          title: `Tin đăng "${name}" đã được duyệt`,
          summary: `Tin đăng "${event.toyTitle}" của bạn đã được Admin duyệt và đang hiển thị trên ToyFlow.`,
          nextStep: 'Người dùng khác đã có thể tìm thấy đồ chơi và gửi yêu cầu cho bạn.',
          actionLabel: 'Xem tin đăng',
        }
      : {
          ...base,
          link: notificationLinks.editListing(event.toyId),
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
    link: notificationLinks.identityVerification(),
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
  // JOB-10 (GB-57) notifies the Donor (MSG56); the receiving side is told as well.
  expired: ['DONOR', 'REQUESTER'],
};

/**
 * GB-56/GB-61: a request the Donor sent to an organization waits for the Admins, so its new
 * PENDING status goes to them (the receiving side) instead of the Donor who sent it.
 */
const audienceOf = (event: DonationStatusChangedEvent): readonly DonationParty[] =>
  event.to === 'pending' &&
  event.receiverType === 'ORGANIZATION' &&
  event.requestedBy === event.donorId
    ? ['REQUESTER']
    : donationAudience[event.to];

// For an ORGANIZATION request, requestedBy is only the Admin who filed it on the
// organization's behalf (or the Donor who sent it), so the receiving side is the Admin team as a
// whole: `adminIds` (every active Admin) replaces requestedBy. Organizations have no account of
// their own to notify.
export const donationRecipients = (
  event: DonationStatusChangedEvent,
  adminIds: readonly string[] = [],
): Array<{ party: DonationParty; userId: string }> =>
  audienceOf(event)
    .flatMap((party): Array<{ party: DonationParty; userId: string }> => {
      if (party === 'DONOR') return [{ party, userId: event.donorId }];
      if (event.receiverType === 'ORGANIZATION')
        return adminIds.map((userId) => ({ party, userId }));
      return [{ party, userId: event.requestedBy }];
    })
    .filter(({ userId }) => userId !== event.changedBy);

/** Whether the recipients of this event include the Admin team (see donationRecipients). */
export const donationNeedsAdmins = (event: DonationStatusChangedEvent): boolean =>
  event.receiverType === 'ORGANIZATION' && audienceOf(event).includes('REQUESTER');

type DonationText = Pick<MessageSpec, 'title' | 'summary' | 'nextStep' | 'actionLabel'>;

const VIEW_REQUEST = 'Xem yêu cầu quyên góp';

const donationTexts = (
  status: DonationStatus,
  party: DonationParty,
  toy: string,
  name: string,
  receiver: string,
  code: string,
  from: DonationStatus | undefined,
  dates: { organization?: string | undefined; handoverDue?: string; receivedOn?: string } = {},
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
      // MSG54 (R03 V.2): "Your donation {code} was accepted by {organization}. Please hand over
      // the toy by {date}."
      return forDonor
        ? {
            title: `Yêu cầu nhận "${name}" đã được chấp nhận`,
            summary: dates.organization
              ? `Yêu cầu quyên góp ${code ? `${code} ` : ''}(đồ chơi "${toy}") đã được ${dates.organization} chấp nhận.`
              : `Admin đã chấp nhận yêu cầu nhận đồ chơi "${toy}"${receiver}.`,
            nextStep: dates.handoverDue
              ? `Vui lòng bàn giao đồ chơi trước ngày ${dates.handoverDue} và tải ảnh bàn giao lên ToyFlow khi gửi đi.`
              : 'Vui lòng chuẩn bị đồ chơi và tải ảnh bàn giao lên ToyFlow khi gửi đi.',
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
        // GB-59: for an organization, the Admin records its confirmation.
        nextStep: dates.organization
          ? 'Khi tổ chức báo đã nhận, vui lòng ghi nhận xác nhận và ảnh nhận hàng trên ToyFlow.'
          : 'Khi nhận được đồ chơi, vui lòng xác nhận đã nhận trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    case 'received':
    case 'completed':
      // MSG55 (R03 V.2): "{organization} received "{toy_name}" on {date}. Thank you for your
      // donation." GB-61: the receipt photos are on the donation detail the notification opens.
      return forDonor
        ? {
            title: `Cảm ơn bạn đã quyên góp "${name}"`,
            summary: dates.receivedOn
              ? `${dates.organization ?? 'Bên nhận'} đã nhận đồ chơi "${toy}" ngày ${dates.receivedOn}.`
              : `Đồ chơi "${toy}" bạn quyên góp đã được trao${receiver} thành công.`,
            nextStep:
              'ToyFlow chân thành cảm ơn tấm lòng của bạn. Xem ảnh nhận hàng trong chi tiết quyên góp.',
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
        nextStep:
          (forDonor && toyAfterCancel(from)) || 'Bạn có thể xem chi tiết yêu cầu trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    // MSG56 (R03 V.2): "Your donation request {code} has expired. {reason}"; the reason is the
    // event reason.
    case 'expired': {
      const request = code ? `Yêu cầu quyên góp ${code}` : 'Yêu cầu quyên góp';
      return {
        title: `${request} đã hết hạn`,
        summary: `${request} (đồ chơi "${toy}"${receiver}) đã hết hạn.`,
        nextStep:
          forDonor && from === 'accepted'
            ? 'Đồ chơi đã trở lại danh sách; bạn có thể tặng cho người nhận hoặc tổ chức khác.'
            : 'Bạn có thể xem chi tiết yêu cầu trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    }
  }
};

/** GB-60: where the toy is after a cancel, for the Donor. */
const toyAfterCancel = (from: DonationStatus | undefined): string | undefined => {
  if (from === 'accepted') return 'Đồ chơi đã trở lại danh sách quyên góp.';
  if (from === 'shipping') {
    return 'Đồ chơi vẫn được ẩn cho tới khi bạn sửa hoặc xoá tin quyên góp.';
  }
  return undefined;
};

/**
 * GB-61: a request the Donor sent to an organization (UC33) is the Donor's donation, which the
 * Admin accepts or rejects for the organization, not a request to receive the toy. The other
 * statuses (shipping, completed, expired) read the same for every request.
 */
const donorSentTexts = (
  status: DonationStatus,
  party: DonationParty,
  toy: string,
  name: string,
  receiver: string,
  code: string,
  from: DonationStatus | undefined,
  dates: { organization?: string | undefined; handoverDue?: string; receivedOn?: string },
  reason: string | undefined,
): DonationText | undefined => {
  const forDonor = party === 'DONOR';
  const donation = `Phiếu quyên góp ${code ? `${code} ` : ''}`;
  switch (status) {
    case 'pending':
      return {
        title: `Có phiếu quyên góp mới "${name}"`,
        summary: `Người quyên góp muốn tặng đồ chơi "${toy}"${receiver}.`,
        nextStep: 'Vui lòng xem phiếu và chấp nhận hoặc từ chối thay tổ chức.',
        actionLabel: VIEW_REQUEST,
      };
    case 'accepted':
      // MSG54 for the Donor (R03 V.2): the code, the organization and the handover deadline.
      return forDonor
        ? {
            title: `Phiếu quyên góp "${name}" đã được chấp nhận`,
            summary: dates.organization
              ? `Yêu cầu quyên góp ${code ? `${code} ` : ''}(đồ chơi "${toy}") đã được ${dates.organization} chấp nhận.`
              : `Admin đã chấp nhận đồ chơi "${toy}" bạn quyên góp${receiver}.`,
            nextStep: dates.handoverDue
              ? `Vui lòng bàn giao đồ chơi trước ngày ${dates.handoverDue} và tải ảnh bàn giao lên ToyFlow khi gửi đi.`
              : 'Vui lòng mang đến hoặc gửi đồ chơi tới điểm nhận và tải ảnh bàn giao lên ToyFlow.',
            actionLabel: VIEW_REQUEST,
          }
        : {
            title: `Phiếu quyên góp "${name}" đã được chấp nhận`,
            summary: `${donation}(đồ chơi "${toy}")${receiver} đã được chấp nhận.`,
            nextStep: 'Người quyên góp sẽ mang đến hoặc gửi đồ chơi tới điểm nhận.',
            actionLabel: VIEW_REQUEST,
          };
    case 'rejected':
      return {
        title: `Phiếu quyên góp "${name}" không được chấp nhận`,
        summary: `${donation}(đồ chơi "${toy}")${receiver} không được chấp nhận.`,
        // UC33 6.1: the post stays open, unless the toy went to another request (GB-60).
        nextStep:
          forDonor && reason !== SIBLING_REJECT_REASON
            ? 'Tin quyên góp vẫn mở: bạn có thể gửi đồ chơi tới tổ chức khác.'
            : 'Bạn có thể xem chi tiết phiếu trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    case 'cancelled':
      return {
        title: `Phiếu quyên góp "${name}" đã bị hủy`,
        summary: `${donation}(đồ chơi "${toy}")${receiver} đã bị hủy.`,
        nextStep:
          (forDonor && toyAfterCancel(from)) || 'Bạn có thể xem chi tiết phiếu trên ToyFlow.',
        actionLabel: VIEW_REQUEST,
      };
    default:
      return undefined;
  }
};

// The Donor opens their donation, the receiving user their request, and the Admins (receiving
// side of an organization) the Admin page of the request.
const donationLink = (event: DonationStatusChangedEvent, party: DonationParty): string => {
  if (party === 'DONOR') return notificationLinks.myDonation(event.donationRequestId);
  return event.receiverType === 'ORGANIZATION'
    ? notificationLinks.adminDonationRequest(event.donationRequestId)
    : notificationLinks.myDonationRequest(event.donationRequestId);
};

/** Statuses whose notification carries the event reason (reject, cancel or expiry reason). */
const WITH_REASON: readonly DonationStatus[] = ['rejected', 'cancelled', 'expired'];

export const renderDonationStatusChanged = (
  event: DonationStatusChangedEvent,
  party: DonationParty,
  context: TemplateContext,
): NotificationMessage => {
  const organization = context.organizationName?.trim();
  const receiver = organization ? ` cho ${organization}` : '';
  const texts = [
    event.to,
    party,
    event.toyTitle,
    shorten(event.toyTitle, MAX_NAME),
    receiver,
    event.code ?? '',
    event.from,
    {
      organization,
      ...(event.handoverDueAt ? { handoverDue: formatVietnamDate(event.handoverDueAt) } : {}),
      ...(event.receivedAt ? { receivedOn: formatVietnamDate(event.receivedAt) } : {}),
    },
  ] as const;
  // A request the Donor sent to an organization (UC33): the Donor created it.
  const donorSent = event.receiverType === 'ORGANIZATION' && event.requestedBy === event.donorId;
  return buildMessage(
    {
      type: 'DONATION_STATUS_CHANGED',
      link: donationLink(event, party),
      reason: WITH_REASON.includes(event.to) ? event.reason : undefined,
      ...((donorSent ? donorSentTexts(...texts, event.reason) : undefined) ??
        donationTexts(...texts)),
    },
    context.appPublicUrl,
  );
};
