// One-off run of the donation expiry job: `npm run jobs:expire-donations`.
import { env } from '../config/env.js';
import { expireStaleRequests } from '../services/donation-request.lifecycle.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { registerEventHandlers } from '../event-handlers.js';

const run = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);
  registerEventHandlers();
  try {
    const result = await expireStaleRequests(new Date());
    console.info('Donation expiry finished.', JSON.stringify(result));
    // Notification handlers run after the events; give them a moment before disconnecting.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Donation expiry failed.', error);
  process.exit(1);
});
