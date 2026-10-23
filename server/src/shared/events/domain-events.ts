import { EventEmitter } from 'node:events';

import type { StoredDonationStatus } from '../../features/donation_requests/donation_requests.model.js';

// Domain events let one feature react to another without importing it (backend-architecture.md).
// Event names are notification types, so the notifications feature maps one event to one
// notifications.type. Publish only after the transaction commits.
// Events are in-process: they are lost if the process stops before the handlers run.

export interface ToyReviewedEvent {
  type: 'TOY_REVIEWED';
  toyId: string;
  ownerId: string;
  toyTitle: string;
  // Toy status after the review: approved toys become 'active', rejected ones 'hidden'.
  decision: 'approved' | 'rejected';
  reason?: string;
  reviewedBy: string;
}

export interface IdentityReviewedEvent {
  type: 'IDENTITY_REVIEWED';
  verificationId: string;
  userId: string;
  decision: 'verified' | 'rejected';
  reason?: string;
  reviewedBy: string;
}

export interface DonationStatusChangedEvent {
  type: 'DONATION_STATUS_CHANGED';
  donationRequestId: string;
  toyId: string;
  toyTitle: string;
  donorId: string;
  requestedBy: string;
  receiverType: 'USER' | 'ORGANIZATION';
  organizationId?: string;
  // Absent when the request has just been created (PENDING).
  from?: StoredDonationStatus;
  to: StoredDonationStatus;
  reason?: string;
  // The user or Admin who made the change; absent for system changes.
  changedBy?: string;
}

export type DomainEvent = ToyReviewedEvent | IdentityReviewedEvent | DonationStatusChangedEvent;

export type DomainEventType = DomainEvent['type'];

type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
type Handler<T extends DomainEventType> = (event: EventOf<T>) => Promise<void> | void;

const emitter = new EventEmitter();

export const domainEvents = {
  // Handlers run after the action; a failing handler (e.g. an email that cannot be sent) is
  // logged and never breaks the action that published the event.
  publish(event: DomainEvent): void {
    emitter.emit(event.type, event);
  },

  subscribe<T extends DomainEventType>(type: T, handler: Handler<T>): () => void {
    const listener = (event: EventOf<T>) => {
      Promise.resolve()
        .then(() => handler(event))
        .catch((error: unknown) =>
          console.error(`Domain event handler for ${type} failed.`, error),
        );
    };
    emitter.on(type, listener);
    return () => emitter.off(type, listener);
  },

  clear(): void {
    emitter.removeAllListeners();
  },
};
