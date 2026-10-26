import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import {
  connectDatabase,
  disconnectDatabase,
} from './config/database.js';
import { createSocketServer } from './sockets/socket.js';

const startServer = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);

  const httpServer = createServer(createApp());
  const socketServer = createSocketServer(httpServer, env.corsOrigin);

  httpServer.listen(env.port, () => {
    console.info(`ToyFlow backend is listening on port ${env.port}.`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`${signal} received. Shutting down ToyFlow backend.`);
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
