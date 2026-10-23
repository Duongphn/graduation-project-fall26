import type { ListingType, ToyAgeRange } from './toy-listing.ports.js';

/** Loại tin trong danh sách công khai: thêm 'donate' (tin quyên góp, priceOrRate 0) ngoài rent/sell */
export type CatalogListingType = ListingType | 'donate';

/**
 * Danh sách đồ chơi công khai (khách chưa đăng nhập cũng xem được).
 * Chỉ chứa thông tin cần để hiển thị — không có ownerId, location, publicId của ảnh.
 */
export interface PublicToyDto {
  id: string;
  categoryId: string;
  title: string;
  condition: string;
  listingType: CatalogListingType;
  priceOrRate: number;
  depositPrice?: number;
  ageRange: ToyAgeRange;
  images: { url: string }[];
  createdAt: Date;
}

export type ToyCatalogSort = 'newest' | 'popular';

export interface ToyCatalogQuery {
  listingType?: CatalogListingType;
  categoryId?: string;
  /** Lọc theo độ tuổi: lấy đồ chơi có khoảng tuổi giao với [minAge, maxAge] */
  minAge?: number;
  maxAge?: number;
  sort: ToyCatalogSort;
  page: number;
  limit: number;
}

export interface ToyCatalogPage {
  items: PublicToyDto[];
  page: number;
  limit: number;
  total: number;
}

/** Bộ lọc đã chuẩn hoá mà repository nhận — chỉ tin đang hiển thị, đã loại các id trong `excludeIds` */
export interface ToyCatalogFilter {
  listingType?: CatalogListingType;
  categoryId?: string;
  minAge?: number;
  maxAge?: number;
  excludeIds: string[];
}

export interface CatalogToyRecord {
  id: string;
  categoryId: string;
  title: string;
  condition: string;
  listingType: CatalogListingType;
  priceOrRate: number;
  depositPrice?: number | undefined;
  ageRange: ToyAgeRange;
  images: { url: string }[];
  createdAt: Date;
}

/** Truy vấn collection toys — tách khỏi service để test không cần MongoDB */
export interface ToyCatalogRepository {
  count(filter: ToyCatalogFilter): Promise<number>;
  /** Tin mới nhất trước */
  findNewest(filter: ToyCatalogFilter, skip: number, limit: number): Promise<CatalogToyRecord[]>;
  /** Lấy theo danh sách id (thứ tự không đảm bảo) */
  findByIds(filter: ToyCatalogFilter, ids: string[]): Promise<CatalogToyRecord[]>;
}

/** Dữ liệu từ các feature khác (đơn mua, đơn thuê) — lớp `app` cung cấp cài đặt */
export interface ToyCatalogPorts {
  /** Đồ chơi đã có đơn mua hoàn tất — không còn hiển thị công khai */
  getSoldToyIds(): Promise<string[]>;
  /** Số đơn thuê theo toyId kể từ `since`, dùng để xếp hạng "phổ biến" */
  getRentalCountsSince(since: Date): Promise<Map<string, number>>;
}
