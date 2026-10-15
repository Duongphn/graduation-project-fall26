import { SystemSettingModel } from '../system_settings/system_settings.model.js';
import { CategoryModel } from './categories.model.js';

/** Starting categories (R02 "Categories and Test Data": at least 10, managed by the Admin). */
export const defaultCategories = [
  { slug: 'do-choi-montessori', name: 'Đồ chơi Montessori' },
  { slug: 'do-choi-stem', name: 'Đồ chơi STEM' },
  { slug: 'phat-trien-van-dong-tinh', name: 'Phát triển vận động tinh' },
  { slug: 'tro-choi-ban-co', name: 'Trò chơi bàn cờ' },
  { slug: 'do-choi-nhap-vai', name: 'Đồ chơi nhập vai' },
  { slug: 'xep-hinh-lap-rap', name: 'Xếp hình và lắp ráp' },
  { slug: 'do-choi-go', name: 'Đồ chơi gỗ' },
  { slug: 'bup-be-thu-bong', name: 'Búp bê và thú bông' },
  { slug: 'xe-va-phuong-tien', name: 'Xe và phương tiện' },
  { slug: 'do-choi-am-nhac', name: 'Đồ chơi âm nhạc' },
  { slug: 'sach-va-the-hoc', name: 'Sách và thẻ học' },
  { slug: 'van-dong-ngoai-troi', name: 'Vận động ngoài trời' },
  { slug: 'do-choi-so-sinh', name: 'Đồ chơi sơ sinh' },
] as const;

/**
 * Inserts the default categories ONCE per database (upsert by slug, `$setOnInsert`), then records
 * the system_settings marker CATEGORIES_SEEDED. While the marker exists it does nothing, so it is
 * safe to run on every deployment (it runs in syncDatabase) and never brings back a category the
 * Admin deleted (even if every category was deleted) nor overwrites a rename. A database that
 * already has categories but no marker (seeded before the marker existed) only gets the marker.
 */
export const seedDefaultCategories = async (): Promise<void> => {
  if (await SystemSettingModel.exists({ key: 'CATEGORIES_SEEDED' })) return;
  if (!(await CategoryModel.exists({}))) {
    await CategoryModel.bulkWrite(
      defaultCategories.map(({ slug, name }, index) => ({
        updateOne: {
          filter: { slug },
          update: {
            $setOnInsert: { slug, name, status: 'ACTIVE', displayOrder: index + 1, parentId: null },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  await SystemSettingModel.updateOne(
    { key: 'CATEGORIES_SEEDED' },
    { $setOnInsert: { key: 'CATEGORIES_SEEDED', value: 1 } },
    { upsert: true },
  );
};
