// One-off: `npm run db:fix-conversation-index` rebuilds the `one_per_order` index of
// conversations with its partial filter. Without it, a second chat from a listing page (no order)
// fails with a duplicate key error. Safe to run again: a correct index is left alone.
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { rebuildOnePerOrderIndex } from '../repositories/chat.repository.js';

const run = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);
  try {
    const { rebuilt } = await rebuildOnePerOrderIndex();
    console.info(rebuilt ? 'Index one_per_order rebuilt.' : 'Index one_per_order already correct.');
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Conversation index fix failed.', error);
  process.exit(1);
});
