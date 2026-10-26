import {
  Baby,
  Bike,
  Blocks,
  Building2,
  Camera,
  Car,
  ChefHat,
  Dices,
  FlaskConical,
  Gift,
  Lock,
  Music,
  Palette,
  Puzzle,
  RefreshCw,
  Rocket,
  Scale,
  Shapes,
  ShieldCheck,
  ShoppingBag,
  Smile,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import age0to1Image from '../../assets/ages/age-0-1.webp'
import age12PlusImage from '../../assets/ages/age-12-99.webp'
import age1to3Image from '../../assets/ages/age-1-3.webp'
import age3to6Image from '../../assets/ages/age-3-6.webp'
import age6to12Image from '../../assets/ages/age-6-12.webp'
import bannerDonateImage from '../../assets/banners/banner-donate.webp'
import categoryGiaoDucStemImage from '../../assets/categories/giao-duc-stem.webp'
import categoryLapRapXepHinhImage from '../../assets/categories/lap-rap-xep-hinh.webp'
import categoryBupBeThuBongImage from '../../assets/categories/bup-be-thu-bong.webp'
import categoryXeDieuKhienImage from '../../assets/categories/xe-dieu-khien.webp'
import categoryBoardGameCauDoImage from '../../assets/categories/board-game-cau-do.webp'
import categoryVanDongNgoaiTroiImage from '../../assets/categories/van-dong-ngoai-troi.webp'
import categorySoSinh03TuoiImage from '../../assets/categories/so-sinh-0-3-tuoi.webp'
import categoryMyThuatThuCongImage from '../../assets/categories/my-thuat-thu-cong.webp'
import categoryNhacCuDoChoiImage from '../../assets/categories/nhac-cu-do-choi.webp'
import categoryNhapVaiNauAnImage from '../../assets/categories/nhap-vai-nau-an.webp'
import bannerRentImage from '../../assets/banners/banner-rent.webp'
import bannerSellImage from '../../assets/banners/banner-sell.webp'
import donationBoxImage from '../../assets/donation/donation-box.webp'
import stepChooseImage from '../../assets/steps/step-1-choose.webp'
import stepPayImage from '../../assets/steps/step-2-pay.webp'
import stepHandoverImage from '../../assets/steps/step-3-handover.webp'
import stepReturnImage from '../../assets/steps/step-4-return.webp'
import { browseToysPath, PATHS } from '../../routes/paths'
import type { ListingType } from '../toy-listings/toy-listing-api'
import { AGE_OPTIONS } from '../toy-listings/toy-listing-schema'

/**
 * Nội dung tĩnh của trang chủ (giới thiệu quy trình, cam kết, điều hướng).
 * Dữ liệu động (đồ chơi, danh mục) luôn lấy từ API — không đặt ở đây.
 */

/** Bảng màu nhấn dùng chung cho icon, ô ảnh chờ và thẻ — mỗi tone có class BEM tương ứng trong home.css */
export type Tone =
  | 'rose'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'emerald'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'fuchsia'
  | 'slate'

export interface CategoryVisual {
  icon: LucideIcon
  tone: Tone
  /** Ảnh minh hoạ danh mục (nền trong suốt) — có thì dùng thay icon trên dải danh mục */
  image?: string
}

/**
 * Icon + màu theo `slug` danh mục trong DB; danh mục mới chưa khai báo dùng FALLBACK.
 * 10 danh mục dùng 10 tông khác nhau, rải đều quanh vòng màu để không hai ô cạnh nhau trùng màu.
 */
const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  'giao-duc-stem': { icon: FlaskConical, tone: 'emerald', image: categoryGiaoDucStemImage },
  'lap-rap-xep-hinh': { icon: Blocks, tone: 'blue', image: categoryLapRapXepHinhImage },
  'bup-be-thu-bong': { icon: Smile, tone: 'rose', image: categoryBupBeThuBongImage },
  'xe-dieu-khien': { icon: Car, tone: 'indigo', image: categoryXeDieuKhienImage },
  'board-game-cau-do': { icon: Dices, tone: 'cyan', image: categoryBoardGameCauDoImage },
  'van-dong-ngoai-troi': { icon: Bike, tone: 'lime', image: categoryVanDongNgoaiTroiImage },
  'so-sinh-0-3-tuoi': { icon: Baby, tone: 'violet', image: categorySoSinh03TuoiImage },
  'my-thuat-thu-cong': { icon: Palette, tone: 'orange', image: categoryMyThuatThuCongImage },
  'nhac-cu-do-choi': { icon: Music, tone: 'fuchsia', image: categoryNhacCuDoChoiImage },
  'nhap-vai-nau-an': { icon: ChefHat, tone: 'amber', image: categoryNhapVaiNauAnImage },
}

const FALLBACK_CATEGORY_VISUAL: CategoryVisual = { icon: Shapes, tone: 'slate' }

export const getCategoryVisual = (slug: string | undefined): CategoryVisual =>
  (slug && CATEGORY_VISUALS[slug]) || FALLBACK_CATEGORY_VISUAL

export interface NavItem {
  label: string
  to: string
}

export const SITE_NAV: NavItem[] = [
  { label: 'Thuê đồ chơi', to: browseToysPath({ type: 'rent' }) },
  { label: 'Mua lại', to: browseToysPath({ type: 'sell' }) },
  { label: 'Quyên góp', to: PATHS.donations },
]

export const HERO_CONTENT = {
  eyebrow: 'Thuê, mua lại và quyên góp đồ chơi trẻ em',
  titleLead: 'Mỗi tuần một món mới,',
  titleHighlight: 'không cần mua mới',
  lead: 'Thuê đồ chơi từ các gia đình gần bạn, mua lại đồ còn tốt, hoặc tặng đồ cho bé khác. Tiết kiệm cho bố mẹ, ít rác thải hơn.',
  searchLabel: 'Tìm đồ chơi',
  searchModesLabel: 'Bạn muốn',
}

export interface HeroSearchMode {
  value: ListingType
  label: string
  placeholder: string
}

/** Header ẩn ô tìm kiếm của nó cho tới khi người dùng cuộn qua ô tìm kiếm ở hero (tránh 2 ô cùng lúc) */
export const HERO_SEARCH_ANCHOR_ID = 'home-hero-search'

/** Tab phía trên ô tìm kiếm ở hero: chọn tìm đồ cho thuê hay đồ bán lại (thay cho 3 card dịch vụ) */
export const HERO_SEARCH_MODES: HeroSearchMode[] = [
  { value: 'rent', label: 'Thuê đồ chơi', placeholder: 'Bé cần đồ chơi gì? Ví dụ: Lego, xe đạp thăng bằng…' },
  { value: 'sell', label: 'Mua đồ cũ', placeholder: 'Tìm đồ chơi cũ giá tốt? Ví dụ: búp bê, board game…' },
]

export interface IconText {
  icon: LucideIcon
  text: string
}

export const TRUST_POINTS: IconText[] = [
  { icon: ShieldCheck, text: 'Người dùng xác minh CCCD' },
  { icon: Wallet, text: 'Tiền cọc giữ trong ví' },
  { icon: Camera, text: 'Ảnh bàn giao 2 chiều' },
  { icon: Lock, text: 'Thanh toán VNPay, MoMo' },
]

export interface HeroBannerSlide {
  id: string
  /** Tông màu nền của slide — có class `hero-banner__slide--{tone}` trong home.css */
  tone: 'sky' | 'orange' | 'emerald'
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  /** 2–3 điểm nổi bật hiển thị dạng chip */
  highlights: string[]
  ctaLabel: string
  to: string
  /** Ảnh banner thật (đặt trong /public, vd. '/banners/thue.webp'); chưa có thì hiển thị hình minh hoạ bằng icon */
  image?: { src: string; alt: string }
}

/** Banner tự trượt ở hero: 3 dịch vụ chính của ToyFlow */
export const HERO_BANNER_SLIDES: HeroBannerSlide[] = [
  {
    id: 'rent',
    tone: 'sky',
    icon: RefreshCw,
    eyebrow: 'Thuê theo ngày',
    title: 'Mỗi tuần một món mới cho bé',
    description: 'Chơi vài tuần rồi đổi món khác. Tiền cọc được giữ trong ví ToyFlow và hoàn lại khi trả đồ.',
    highlights: ['Cọc giữ trong ví', 'Ảnh bàn giao 2 chiều'],
    ctaLabel: 'Xem đồ cho thuê',
    to: browseToysPath({ type: 'rent' }),
    image: { src: bannerRentImage, alt: 'Kệ trưng bày nhiều đồ chơi trẻ em nhiều màu sắc' },
  },
  {
    id: 'sell',
    tone: 'orange',
    icon: ShoppingBag,
    eyebrow: 'Mua lại đồ cũ',
    title: 'Đồ chơi còn tốt, giá mềm',
    description: 'Tiền được giữ trung gian, chỉ chuyển cho người bán khi bạn xác nhận đã nhận đồ.',
    highlights: ['Giữ tiền trung gian', 'Người bán xác minh CCCD'],
    ctaLabel: 'Xem đồ bán lại',
    to: browseToysPath({ type: 'sell' }),
    image: { src: bannerSellImage, alt: 'Nhiều đồ chơi cũ còn tốt bày trên sàn nhà' },
  },
  {
    id: 'donate',
    tone: 'emerald',
    icon: Gift,
    eyebrow: 'Tặng và quyên góp',
    title: 'Đồ bé không chơi nữa, bé khác đang cần',
    description: 'Tặng đồ chơi cho gia đình khác hoặc các tổ chức từ thiện đã được ToyFlow xác minh.',
    highlights: ['Tổ chức đã xác minh', 'Miễn phí đăng tặng'],
    ctaLabel: 'Đến góc quyên góp',
    to: PATHS.donations,
    image: { src: bannerDonateImage, alt: 'Các em nhỏ nhận thú bông và đồ chơi được quyên góp' },
  },
]

export interface Step {
  title: string
  description: string
  /** Ảnh minh hoạ 3D nền trong suốt (src/assets/steps) */
  image: string
}

export const RENTAL_STEPS: Step[] = [
  {
    title: 'Chọn đồ, gửi yêu cầu',
    description: 'Chọn ngày thuê. Chủ đồ xác nhận ngay trong ứng dụng.',
    image: stepChooseImage,
  },
  {
    title: 'Thanh toán từ ví',
    description: 'Trả tiền thuê qua ví. Tiền cọc được tạm giữ, chủ đồ chưa nhận.',
    image: stepPayImage,
  },
  {
    title: 'Giao nhận có ảnh',
    description: 'Hai bên chụp ảnh lúc giao và lúc trả. AI so sánh để phát hiện hư hỏng.',
    image: stepHandoverImage,
  },
  {
    title: 'Trả đồ, nhận lại cọc',
    description: 'Cọc hoàn về ví của bạn. Hai bên đánh giá nhau để tăng điểm uy tín.',
    image: stepReturnImage,
  },
]

export interface AgeGroup {
  icon: LucideIcon
  tone: Tone
  /** Tên hiển thị, vd. "1 - 3 tuổi" (phần trong ngoặc của AGE_OPTIONS đã tách ra thành `tag`) */
  title: string
  hint: string
  /** Nhãn giai đoạn, vd. "Mầm non" */
  tag?: string
  /** Ảnh minh hoạ nền trong suốt (src/assets/ages); không có thì dùng icon */
  image?: string
  minAge: number
  maxAge: number
}

interface AgeGroupVisual {
  icon: LucideIcon
  tone: Tone
  hint: string
  tag?: string
  image?: string
}

/** Icon, ảnh, nhãn theo khoảng tuổi `${minAge}-${maxAge}` của AGE_OPTIONS; khoảng mới chưa khai báo dùng FALLBACK */
const AGE_GROUP_VISUALS: Record<string, AgeGroupVisual> = {
  '0-1': { icon: Baby, tone: 'violet', hint: 'Sơ sinh, tập lẫy, tập bò', tag: 'Sơ sinh', image: age0to1Image },
  '1-3': { icon: Smile, tone: 'rose', hint: 'Tập đi, khám phá giác quan', tag: 'Mầm non', image: age1to3Image },
  '3-6': { icon: Puzzle, tone: 'amber', hint: 'Nhập vai, lắp ráp đơn giản', tag: 'Mẫu giáo', image: age3to6Image },
  '6-12': { icon: Rocket, tone: 'sky', hint: 'STEM, board game, vận động', tag: 'Tiểu học', image: age6to12Image },
  '12-99': { icon: Blocks, tone: 'emerald', hint: 'Mô hình, đồ sưu tầm', tag: 'Sưu tầm', image: age12PlusImage },
}

const FALLBACK_AGE_GROUP_VISUAL: AgeGroupVisual = { icon: Shapes, tone: 'slate', hint: 'Xem đồ chơi phù hợp' }

/** "1 - 3 tuổi (Mầm non)" → "1 - 3 tuổi" (giai đoạn đã có ở nhãn `tag`) */
const stripStage = (label: string) => label.replace(/\s*\(.*\)\s*$/, '').trim()

/**
 * Nhóm tuổi lấy từ cùng nguồn với form đăng tin (AGE_OPTIONS) — tin đăng và bộ lọc
 * trên trang chủ luôn dùng chung một cách chia tuổi.
 */
export const AGE_GROUPS: AgeGroup[] = AGE_OPTIONS.map(({ label, minAge, maxAge }) => ({
  ...(AGE_GROUP_VISUALS[`${minAge}-${maxAge}`] ?? FALLBACK_AGE_GROUP_VISUAL),
  title: stripStage(label),
  minAge,
  maxAge,
}))

/** Mỏ neo của thẻ "Hỏi AI tư vấn" — mục "Trợ lý AI" trên header cuộn tới đây */
export const AI_ADVISOR_ANCHOR_ID = 'tro-ly-ai'

export const AI_ADVISOR_CONTENT = {
  badge: 'Trợ lý AI · Robo',
  titleLead: 'Chưa biết chọn gì?',
  titleHighlight: 'Hỏi AI tư vấn',
  description: 'Cho biết tuổi, sở thích và ngân sách của bé. AI gợi ý những món đồ chơi đang có sẵn gần bạn.',
  inputLabel: 'Câu hỏi cho trợ lý AI',
  inputPlaceholder: 'Bạn đang tìm đồ chơi gì cho bé?…',
  examplePromptsLabel: 'Hoặc thử hỏi',
  examplePrompts: ['Bé 4 tuổi thích xe', 'Đồ STEM dưới 50.000 đ/ngày'],
}

export const AI_ADVISOR_NAV_ITEM: NavItem = { label: 'Trợ lý AI', to: `${PATHS.home}#${AI_ADVISOR_ANCHOR_ID}` }

/** Cam kết duy nhất chưa có ở dải tin cậy trên hero và 4 bước thuê — hiển thị dưới 4 bước */
export const RENTAL_GUARANTEE: IconText = {
  icon: Scale,
  text: 'Có tranh chấp? Admin xem bằng chứng của hai bên và quyết định, mức bồi thường không vượt quá tiền cọc.',
}

export const DONATION_CONTENT = {
  badge: 'Sẻ chia niềm vui · Cộng đồng ToyFlow',
  title: 'Góc yêu thương',
  description: 'Đăng đồ chơi ở mục "Tặng". Gia đình khác hoặc tổ chức từ thiện đã xác minh sẽ gửi yêu cầu nhận đồ.',
  /**
   * Điểm nổi bật dạng chip. Đây là cam kết của nền tảng, KHÔNG phải số liệu —
   * khi backend có thống kê (số món đã tặng, số tổ chức) thì thay bằng số thật từ API.
   */
  highlights: [
    { icon: Gift, text: 'Miễn phí đăng tặng' },
    { icon: Building2, text: 'Mái ấm & quỹ từ thiện được xác minh' },
  ] satisfies IconText[],
  primaryLabel: 'Tặng đồ chơi',
  secondaryLabel: 'Xem đồ đang tặng',
  image: donationBoxImage,
  imageAlt: 'Thùng quà đầy gấu bông và đồ chơi gỗ',
}

export interface FooterColumn {
  title: string
  links: NavItem[]
}

export const FOOTER_TAGLINE =
  'Nơi phụ huynh cho thuê, bán lại và quyên góp đồ chơi trẻ em đã qua sử dụng. An toàn với tiền cọc, xác minh danh tính và ảnh bàn giao.'

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Dịch vụ',
    links: [
      { label: 'Thuê đồ chơi', to: browseToysPath({ type: 'rent' }) },
      { label: 'Mua đồ chơi cũ', to: browseToysPath({ type: 'sell' }) },
      { label: 'Quyên góp từ thiện', to: PATHS.donations },
      { label: 'AI tư vấn theo tuổi', to: PATHS.aiAdvisor },
    ],
  },
  {
    title: 'Hỗ trợ',
    links: [
      { label: 'Cách thuê & đặt cọc', to: `${PATHS.help}#rental` },
      { label: 'Quy định chất lượng', to: `${PATHS.help}#quality` },
      { label: 'Khiếu nại & tranh chấp', to: `${PATHS.help}#disputes` },
      { label: 'Xác minh danh tính', to: `${PATHS.help}#verification` },
    ],
  },
  {
    title: 'Tài khoản',
    links: [
      { label: 'Đăng tin', to: PATHS.newListing },
      { label: 'Tin đăng của tôi', to: PATHS.myListings },
    ],
  },
]
