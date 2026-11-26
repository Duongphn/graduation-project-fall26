// What the chat service (UC25) needs from the outside: the Socket.IO server. Notifications go
// through the shared notify() (utils/notify.ts).

/** Pushes chat events to signed-in users over the shared Socket.IO connection. */
export interface ChatRealtime {
  /** True when the user has at least one open Socket.IO connection. */
  isUserOnline(userId: string): Promise<boolean>;
  /** Sends `event` to every connection of these users (each connection once). */
  publish(userIds: readonly string[], event: string, payload: unknown): void;
}

/** No Socket.IO server attached (tests, scripts): nobody is online and nothing is pushed. */
export const offlineChatRealtime: ChatRealtime = {
  isUserOnline: () => Promise.resolve(false),
  publish: () => undefined,
};
