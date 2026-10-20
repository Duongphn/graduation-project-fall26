import type { Server as SocketIoServer } from 'socket.io';
import type {
  IdentityVerificationEvents,
  VerificationStatus,
} from '../../features/identity_verifications/identity-verification.ports.js';
import Notification from '../../features/notifications/notifications.model.js';

export interface CreateIdentityVerificationEventsOptions {
  io?: SocketIoServer;
}

export class DefaultIdentityVerificationEvents implements IdentityVerificationEvents {
  public constructor(private readonly options?: CreateIdentityVerificationEventsOptions) {}

  public async publishStatusChanged(
    userId: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ): Promise<void> {
    const isApproved = status === 'verified';
    const title = isApproved
      ? 'Hồ sơ xác thực danh tính đã được phê duyệt'
      : 'Hồ sơ xác thực danh tính đã bị từ chối';
    const body = isApproved
      ? 'Chúc mừng! Tài khoản của bạn đã được xác minh danh tính thành công.'
      : `Hồ sơ xác thực của bạn không được phê duyệt. Lý do: ${rejectionReason || 'Không rõ'}. Bạn có thể nộp lại hồ sơ mới.`;

    try {
      await Notification.create({
        userId,
        title,
        body,
        type: 'IDENTITY_REVIEWED',
        isRead: false,
      });
    } catch {
      // Non-blocking
    }

    try {
      if (this.options?.io) {
        this.options.io.to(`user:${userId}`).emit('notification:identity_status', {
          userId,
          status,
          rejectionReason,
          title,
          body,
        });
      }
    } catch {
      // Non-blocking
    }
  }
}
