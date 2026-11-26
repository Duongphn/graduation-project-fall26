import { domainEvents } from '../utils/domain-events.js';
import { createRequestForApprovedPost } from './donation-request.service.js';

type Unsubscribe = () => void;

let active: Unsubscribe | undefined;

/**
 * Handlers of the donation flow for other features' events (event-handlers.ts). UC33 step 5:
 * when the Admin approves a new donation post sent to an organization, its request is created.
 * Calling it again replaces the previous subscription, so each event is handled once.
 */
export const subscribeDonations = (): Unsubscribe => {
  active?.();
  const off = domainEvents.subscribe('TOY_REVIEWED', async (event) => {
    if (event.decision === 'approved') await createRequestForApprovedPost(event.toyId);
  });
  const unsubscribe: Unsubscribe = () => {
    off();
    if (active === unsubscribe) active = undefined;
  };
  active = unsubscribe;
  return unsubscribe;
};
