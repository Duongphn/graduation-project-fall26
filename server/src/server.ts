import { createServer } from 'node:http';

import { createApp } from './app.js';
import { assertRequiredSecrets, env } from './config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
} from './config/database.js';
import { createContainer } from './container.js';
import { startRentalScheduler } from './services/rental-timer.service.js';
import { registerEventHandlers } from './event-handlers.js';
import { startAccountUnlockJob } from './jobs/account-unlock.job.js';
import { startDonationExpiryJob } from './jobs/donation-expiry.job.js';
import { startPaymentExpiryJob } from './jobs/payment-expiry.job.js';
import { setOpenConnectionCloser } from './services/account-lock.service.js';
import { setNotificationPusher } from './services/notification.service.js';
import { createSocketPusher, createSocketServer, disconnectUser } from './sockets/socket.js';
import { registerChatSocket } from './sockets/chat.socket.js';

const startServer = async (): Promise<void> => {
  assertRequiredSecrets();
  await connectDatabase(env.mongoDbUri);
  registerEventHandlers();
  const donationExpiryJob = startDonationExpiryJob();
  const accountUnlockJob = startAccountUnlockJob();

  const container = createContainer();
  const paymentExpiryJob = startPaymentExpiryJob(container.payosTopupService);
  const httpServer = createServer(createApp(undefined, container));
  const socketServer = createSocketServer(httpServer, env.corsOrigin);
  setNotificationPusher(createSocketPusher(socketServer));
  setOpenConnectionCloser((userId) => disconnectUser(socketServer, userId));
  registerChatSocket(socketServer, container.chatService, container.chatRealtime);

  let stopScheduler: (() => void) | undefined;
  if (env.rentalSchedulerEnabled) {
    stopScheduler = startRentalScheduler(container.rentalTimerService);
    console.info('Rental scheduler started.');
  }

  httpServer.listen(env.port, () => {
    console.info(`ToyFlow backend is listening on port ${env.port}.`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`${signal} received. Shutting down ToyFlow backend.`);
    if (stopScheduler) {
      stopScheduler();
    }
    donationExpiryJob?.stop();
    paymentExpiryJob?.stop();
    accountUnlockJob?.stop();
    socketServer.close();
    httpServer.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

startServer().catch((error: unknown) => {
  console.error('ToyFlow backend failed to start.', error);
  process.exit(1);
});
