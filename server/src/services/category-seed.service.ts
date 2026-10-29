import {
  CATEGORIES_SEEDED_KEY,
  defaultCategories,
} from '../constants/default-categories.js';
import { Category } from '../models/category.model.js';
import { SystemSetting } from '../models/system-setting.model.js';

export interface SeedCategoriesResult {
  /** Categories inserted by this run (0 when the database was already seeded or not empty). */
  inserted: number;
}

/**
 * Inserts the default categories ONCE per database (upsert by slug, `$setOnInsert`), then records
 * the system_settings marker CATEGORIES_SEEDED. While the marker exists it does nothing, so it is
 * safe to run on every deployment and never brings back a category the Admin deleted (even if
 * every category was deleted) nor overwrites a rename. A database that already has categories but
 * no marker (seeded before the marker existed) only gets the marker.
 */
export const seedDefaultCategories = async (): Promise<SeedCategoriesResult> => {
  if (await SystemSetting.exists({ key: CATEGORIES_SEEDED_KEY })) return { inserted: 0 };

  let inserted = 0;
  if (!(await Category.exists({}))) {
    const result = await Category.bulkWrite(
      defaultCategories.map(({ slug, name }, index) => ({
        updateOne: {
          filter: { slug },
          update: {
            $setOnInsert: { slug, name, status: 'active', displayOrder: index + 1, parent_id: null },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    inserted = result.upsertedCount;
  }

  await SystemSetting.updateOne(
    { key: CATEGORIES_SEEDED_KEY },
    {
      $setOnInsert: {
        key: CATEGORIES_SEEDED_KEY,
        value: '1',
        description: 'Default toy categories were seeded (internal marker).',
      },
    },
    { upsert: true },
  );
  return { inserted };
};
