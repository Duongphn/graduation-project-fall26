import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';

export const createSocketServer = (server: HttpServer, corsOrigin: string): Server =>
  new Server(server, {
    cors: {
      origin: corsOrigin,
    },
  });
