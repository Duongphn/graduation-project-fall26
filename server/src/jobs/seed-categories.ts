// One-off seed of the default toy categories: `npm run db:seed-categories`.
// Safe to run again: it never brings back a deleted category nor overwrites a rename.
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { seedDefaultCategories } from '../services/category-seed.service.js';

const run = async (): Promise<void> => {
  await connectDatabase(env.mongoDbUri);
  try {
    const { inserted } = await seedDefaultCategories();
    console.info(
      inserted > 0
        ? `Seeded ${inserted} default categories.`
        : 'Categories already seeded (or the collection is not empty): nothing to do.',
    );
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Category seed failed.', error);
  process.exit(1);
});
