/**
 * DỮ LIỆU MẪU — chỉ để xem trước giao diện "Đồ cho thuê nổi bật" và "Đồ cũ bán lại" khi DB chưa có tin.
 * Chỉ được nạp ở môi trường dev khi bật mock (xem `isMockingHomeToys` trong home-api.ts);
 * bản build production không chứa file này.
 */
import { CONDITION_OPTIONS } from '../../toy-listings/toy-listing-schema'
import type { ListingType } from '../../toy-listings/toy-listing-api'
import { fetchHomeCategories, type PublicToy, type PublicToysPage } from '../home-api'

const [NEW, LIKE_NEW, GOOD] = CONDITION_OPTIONS.map((option) => option.value)

interface MockToy {
  categorySlug: string
  title: string
  /** Thuê: giá/ngày; bán lại: giá bán */
  price: number
  /** Chỉ tin cho thuê có tiền cọc */
  deposit?: number
  minAge: number
  maxAge: number
  condition: string
  district: string
}

const MOCK_TOYS: Record<ListingType, MockToy[]> = {
  rent: [
    { categorySlug: 'lap-rap-xep-hinh', title: 'Bộ LEGO Classic 500 chi tiết', price: 25_000, deposit: 400_000, minAge: 4, maxAge: 8, condition: LIKE_NEW, district: 'Quận 3, TP.HCM' },
    { categorySlug: 'nhap-vai-nau-an', title: 'Bộ đồ chơi nhà bếp gỗ Montessori', price: 30_000, deposit: 600_000, minAge: 3, maxAge: 6, condition: LIKE_NEW, district: 'Quận 7, TP.HCM' },
    { categorySlug: 'giao-duc-stem', title: 'Robot lập trình mini cho bé', price: 45_000, deposit: 900_000, minAge: 6, maxAge: 12, condition: GOOD, district: 'Cầu Giấy, Hà Nội' },
    { categorySlug: 'nhac-cu-do-choi', title: 'Đàn piano điện tử 37 phím', price: 35_000, deposit: 700_000, minAge: 4, maxAge: 10, condition: LIKE_NEW, district: 'Thủ Đức, TP.HCM' },
    { categorySlug: 'xe-dieu-khien', title: 'Xe địa hình điều khiển từ xa 2.4GHz', price: 40_000, deposit: 800_000, minAge: 6, maxAge: 12, condition: GOOD, district: 'Bình Thạnh, TP.HCM' },
    { categorySlug: 'van-dong-ngoai-troi', title: 'Xe chòi chân thăng bằng cho bé', price: 28_000, deposit: 500_000, minAge: 2, maxAge: 5, condition: LIKE_NEW, district: 'Hải Châu, Đà Nẵng' },
    { categorySlug: 'so-sinh-0-3-tuoi', title: 'Bộ xúc xắc và tháp vòng cho bé sơ sinh', price: 15_000, deposit: 200_000, minAge: 0, maxAge: 1, condition: NEW, district: 'Quận 10, TP.HCM' },
    { categorySlug: 'board-game-cau-do', title: 'Board game Cờ tỷ phú Việt Nam', price: 15_000, deposit: 200_000, minAge: 8, maxAge: 99, condition: GOOD, district: 'Đống Đa, Hà Nội' },
    { categorySlug: 'bup-be-thu-bong', title: 'Nhà búp bê 3 tầng kèm nội thất', price: 32_000, deposit: 650_000, minAge: 3, maxAge: 8, condition: LIKE_NEW, district: 'Gò Vấp, TP.HCM' },
    { categorySlug: 'my-thuat-thu-cong', title: 'Bộ đất nặn và dụng cụ tạo hình 24 món', price: 12_000, deposit: 150_000, minAge: 3, maxAge: 8, condition: NEW, district: 'Phú Nhuận, TP.HCM' },
    { categorySlug: 'lap-rap-xep-hinh', title: 'Bộ xếp hình nam châm 100 miếng', price: 22_000, deposit: 350_000, minAge: 3, maxAge: 10, condition: LIKE_NEW, district: 'Tân Bình, TP.HCM' },
    { categorySlug: 'giao-duc-stem', title: 'Bộ thí nghiệm khoa học nhí 30 thí nghiệm', price: 32_000, deposit: 450_000, minAge: 8, maxAge: 12, condition: GOOD, district: 'Hai Bà Trưng, Hà Nội' },
    { categorySlug: 'xe-dieu-khien', title: 'Xe điện trẻ em 2 động cơ có điều khiển', price: 60_000, deposit: 1_500_000, minAge: 3, maxAge: 7, condition: LIKE_NEW, district: 'Quận 2, TP.HCM' },
    { categorySlug: 'van-dong-ngoai-troi', title: 'Nhà bóng kèm 200 bóng nhựa', price: 40_000, deposit: 600_000, minAge: 1, maxAge: 4, condition: GOOD, district: 'Bình Tân, TP.HCM' },
    { categorySlug: 'board-game-cau-do', title: 'Board game Ma sói phiên bản gia đình', price: 18_000, deposit: 250_000, minAge: 8, maxAge: 99, condition: LIKE_NEW, district: 'Ba Đình, Hà Nội' },
    { categorySlug: 'nhac-cu-do-choi', title: 'Bộ trống jazz mini 5 trống cho bé', price: 38_000, deposit: 650_000, minAge: 3, maxAge: 8, condition: GOOD, district: 'Sơn Trà, Đà Nẵng' },
    { categorySlug: 'bup-be-thu-bong', title: 'Bộ búp bê gia đình và nhà gỗ mini', price: 26_000, deposit: 400_000, minAge: 3, maxAge: 8, condition: LIKE_NEW, district: 'Quận 1, TP.HCM' },
    { categorySlug: 'so-sinh-0-3-tuoi', title: 'Thảm chơi nhạc có kệ đồ chơi cho bé', price: 20_000, deposit: 300_000, minAge: 0, maxAge: 1, condition: LIKE_NEW, district: 'Long Biên, Hà Nội' },
  ],
  sell: [
    { categorySlug: 'van-dong-ngoai-troi', title: 'Xe đạp thăng bằng cho bé 2–5 tuổi', price: 450_000, minAge: 2, maxAge: 5, condition: GOOD, district: 'Thủ Đức, TP.HCM' },
    { categorySlug: 'lap-rap-xep-hinh', title: 'Bộ LEGO Duplo nông trại vui vẻ', price: 550_000, minAge: 2, maxAge: 5, condition: LIKE_NEW, district: 'Thanh Xuân, Hà Nội' },
    { categorySlug: 'xe-dieu-khien', title: 'Xe cứu hoả điều khiển có đèn và còi', price: 320_000, minAge: 3, maxAge: 8, condition: GOOD, district: 'Quận 7, TP.HCM' },
    { categorySlug: 'bup-be-thu-bong', title: 'Gấu bông Teddy 80cm kèm búp bê váy hồng', price: 280_000, minAge: 3, maxAge: 99, condition: LIKE_NEW, district: 'Tân Phú, TP.HCM' },
    { categorySlug: 'so-sinh-0-3-tuoi', title: 'Kệ chữ A treo đồ chơi cho bé sơ sinh', price: 190_000, minAge: 0, maxAge: 1, condition: GOOD, district: 'Ngũ Hành Sơn, Đà Nẵng' },
    { categorySlug: 'giao-duc-stem', title: 'Kính hiển vi nhí 1200x kèm bộ mẫu vật', price: 350_000, minAge: 8, maxAge: 12, condition: LIKE_NEW, district: 'Quận 5, TP.HCM' },
    { categorySlug: 'nhac-cu-do-choi', title: 'Đàn guitar gỗ mini 4 dây cho bé', price: 210_000, minAge: 4, maxAge: 10, condition: GOOD, district: 'Hoàn Kiếm, Hà Nội' },
    { categorySlug: 'board-game-cau-do', title: 'Bộ cờ vua gỗ nam châm gấp gọn', price: 160_000, minAge: 6, maxAge: 99, condition: LIKE_NEW, district: 'Quận 3, TP.HCM' },
    { categorySlug: 'nhap-vai-nau-an', title: 'Xe đẩy siêu thị kèm thực phẩm đồ chơi', price: 240_000, minAge: 2, maxAge: 6, condition: GOOD, district: 'Bình Thạnh, TP.HCM' },
    { categorySlug: 'my-thuat-thu-cong', title: 'Bảng vẽ 2 mặt có giá đỡ và phấn', price: 290_000, minAge: 3, maxAge: 10, condition: GOOD, district: 'Cẩm Lệ, Đà Nẵng' },
    { categorySlug: 'van-dong-ngoai-troi', title: 'Xe scooter 3 bánh có đèn LED', price: 320_000, minAge: 3, maxAge: 8, condition: LIKE_NEW, district: 'Gò Vấp, TP.HCM' },
    { categorySlug: 'lap-rap-xep-hinh', title: 'Bộ xếp hình gỗ thành phố 120 khối', price: 260_000, minAge: 3, maxAge: 8, condition: NEW, district: 'Hà Đông, Hà Nội' },
    { categorySlug: 'xe-dieu-khien', title: 'Máy bay điều khiển mini có camera', price: 480_000, minAge: 8, maxAge: 99, condition: GOOD, district: 'Quận 10, TP.HCM' },
    { categorySlug: 'bup-be-thu-bong', title: 'Bộ thú bông nông trại 6 con', price: 150_000, minAge: 0, maxAge: 99, condition: LIKE_NEW, district: 'Thủ Đức, TP.HCM' },
  ],
}

/** Trả về đúng 1 trang (page, limit) như API thật để thử luồng "Xem thêm" tải trang tiếp theo */
export async function buildMockToys(listingType: ListingType, page: number, limit: number): Promise<PublicToysPage> {
  // Gắn vào danh mục THẬT trong DB (theo slug) để thẻ hiện đúng tên + ảnh danh mục
  const categories = await fetchHomeCategories().catch(() => [])
  const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]))
  const now = Date.now()
  const all = MOCK_TOYS[listingType]
  const start = (page - 1) * limit

  const items: PublicToy[] = all.slice(start, start + limit).map((toy, offset) => {
    const index = start + offset
    return {
      id: `mock-${listingType}-${index + 1}`,
      categoryId: categoryIdBySlug.get(toy.categorySlug) ?? toy.categorySlug,
      title: toy.title,
      condition: toy.condition,
      listingType,
      priceOrRate: toy.price,
      ...(toy.deposit !== undefined ? { depositPrice: toy.deposit } : {}),
      ageRange: { minAge: toy.minAge, maxAge: toy.maxAge },
      images: [],
      district: toy.district,
      createdAt: new Date(now - index * 3_600_000).toISOString(),
    }
  })

  return { items, page, limit, total: all.length }
}
