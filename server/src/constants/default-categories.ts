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

/** system_settings key written once the defaults were seeded (internal marker, not Admin-editable). */
export const CATEGORIES_SEEDED_KEY = 'CATEGORIES_SEEDED';
