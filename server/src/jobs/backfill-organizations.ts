// One-off: `npm run db:backfill-organizations` writes the defaults of the receiving point and
// needs profile fields (17/11/2026) on older organizations. Safe to run again. The API already
// reads a missing field as its default, so running it is optional.
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { backfillOrganizationDefaults } from '../repositories/organization.repository.js';

const run = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);
  try {
    const updated = await backfillOrganizationDefaults();
    console.info('Organization defaults written:', updated);
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Organization backfill failed.', error);
  process.exit(1);
});
