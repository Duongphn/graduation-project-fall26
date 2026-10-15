import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/mongoose.js';
import { syncDatabase } from './models.js';

// `npm run db:sync`: one-off command that applies collections, indexes, validators and seeds
// to the database in MONGODB_URI. Safe to run again; it never deletes data.
const run = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);
  try {
    await syncDatabase();
    console.info('Database is in sync with the models.');
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Database sync failed.', error);
  process.exit(1);
});
