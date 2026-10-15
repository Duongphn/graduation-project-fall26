// Composition root for domain events (backend-architecture.md): features never import each
// other; a feature that reacts to another feature's event is subscribed here, one line per
// subscription.
export const registerEventHandlers = (): void => {
  // No subscriptions yet.
};
