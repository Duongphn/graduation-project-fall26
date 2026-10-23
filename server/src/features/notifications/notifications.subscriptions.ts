import { env } from '../../config/env.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
  type IdentityReviewedEvent,
  type ToyReviewedEvent,
} from '../../shared/events/domain-events.js';
import {
  donationNeedsAdmins,
  donationRecipients,
  renderDonationStatusChanged,
  renderIdentityReviewed,
  renderToyReviewed,
  type TemplateContext,
} from './notification-templates.js';
import { findActiveAdminIds, findOrganizationName } from './notifications.repository.js';
import { createNotifier, describeError, type NotifierOptions } from './notifications.service.js';

type Unsubscribe = () => void;

export interface SubscribeOptions extends NotifierOptions {
  /** Base URL of the user web app, for links in emails. */
  appPublicUrl?: string;
}

const defaultAppPublicUrl = (): string => process.env.APP_PUBLIC_URL?.trim() || env.corsOrigin;

// The charity group's name for donation messages. A failed lookup only drops the name.
const organizationNameOf = async (organizationId: string | undefined) => {
  if (!organizationId) return undefined;
  try {
    return await findOrganizationName(organizationId);
  } catch {
    return undefined;
  }
};

// The handlers never throw: the action that published the event has committed, so a failure is
// only logged (one line, no personal data).
export const createNotificationHandlers = (options: SubscribeOptions = {}) => {
  const notifier = createNotifier(options);
  const context: TemplateContext = { appPublicUrl: options.appPublicUrl ?? defaultAppPublicUrl() };
  const guard =
    <E extends { type: string }>(handle: (event: E) => Promise<unknown>) =>
    async (event: E): Promise<void> => {
      try {
        await handle(event);
      } catch (error) {
        console.error(`[notifications] ${event.type} not delivered: ${describeError(error)}`);
      }
    };

  return {
    toyReviewed: guard((event: ToyReviewedEvent) =>
      notifier.notifyUser(event.ownerId, renderToyReviewed(event, context)),
    ),
    identityReviewed: guard((event: IdentityReviewedEvent) =>
      notifier.notifyUser(event.userId, renderIdentityReviewed(event, context)),
    ),
    donationStatusChanged: guard(async (event: DonationStatusChangedEvent) => {
      const adminIds = donationNeedsAdmins(event) ? await findActiveAdminIds() : [];
      const recipients = donationRecipients(event, adminIds);
      if (recipients.length === 0) return;
      const organizationName = await organizationNameOf(event.organizationId);
      // In parallel: one slow or failing recipient does not delay the others.
      const results = await Promise.allSettled(
        recipients.map(({ party, userId }) =>
          notifier.notifyUser(
            userId,
            renderDonationStatusChanged(event, party, { ...context, organizationName }),
          ),
        ),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    }),
  };
};

let active: Unsubscribe | undefined;

/**
 * Registers every notification handler. Calling it again replaces the previous subscription,
 * so each event is handled once however many times the app (or a test) subscribes.
 */
export const subscribeNotifications = (options: SubscribeOptions = {}): Unsubscribe => {
  active?.();
  const handlers = createNotificationHandlers(options);
  const offs = [
    domainEvents.subscribe('TOY_REVIEWED', handlers.toyReviewed),
    domainEvents.subscribe('IDENTITY_REVIEWED', handlers.identityReviewed),
    domainEvents.subscribe('DONATION_STATUS_CHANGED', handlers.donationStatusChanged),
  ];
  const unsubscribe: Unsubscribe = () => {
    offs.forEach((off) => off());
    if (active === unsubscribe) active = undefined;
  };
  active = unsubscribe;
  return unsubscribe;
};
