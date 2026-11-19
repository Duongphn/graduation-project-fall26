import type {
  IdentityVerificationEvents,
  VerificationStatus,
} from '../../interfaces/identity-verification.ports.js';
import { domainEvents } from '../../utils/domain-events.js';

/**
 * Identity review decisions (UC27) as one IDENTITY_REVIEWED event: the notifications feature
 * writes the in-app notification, pushes it and emails it (MSG19). Both Admin review routes go
 * through develop's IdentityVerificationService, which calls this once per decision.
 */
export class IdentityReviewNotifications implements IdentityVerificationEvents {
  public publishStatusChanged(
    userId: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ): Promise<void> {
    if (status !== 'pending') {
      domainEvents.publish({
        type: 'IDENTITY_REVIEWED',
        userId,
        decision: status,
        ...(rejectionReason ? { reason: rejectionReason } : {}),
      });
    }
    return Promise.resolve();
  }
}
