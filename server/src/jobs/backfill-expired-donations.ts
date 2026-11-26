// One-off: `npm run db:backfill-expired-donations` moves the donation requests that the old
// expiry job saved as cancelled (reason EXPIRED) to the expired status (R04 3.9, 18/11/2026).
// Safe to run again. Until it runs, those requests still show as cancelled with the expiry note.
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { backfillExpiredStatus } from '../repositories/donation-request.repository.js';

const run = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);
  try {
    const updated = await backfillExpiredStatus();
    console.info('Donation requests moved to expired:', updated);
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Expired donation backfill failed.', error);
  process.exit(1);
});
