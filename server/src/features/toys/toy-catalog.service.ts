import type {
  CatalogToyRecord,
  PublicToyDto,
  ToyCatalogFilter,
  ToyCatalogPage,
  ToyCatalogPorts,
  ToyCatalogQuery,
  ToyCatalogRepository,
} from './toy-catalog.types.js';

/** "Phổ biến" = nhiều đơn thuê nhất trong khoảng thời gian này */
export const POPULAR_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function toPublicDto(record: CatalogToyRecord): PublicToyDto {
  return {
    id: record.id,
    categoryId: record.categoryId,
    title: record.title,
    condition: record.condition,
    listingType: record.listingType,
    priceOrRate: record.priceOrRate,
    // Tiền cọc chỉ có nghĩa với tin cho thuê (cùng quy tắc với ToyListingService)
    ...(record.listingType === 'rent' && record.depositPrice !== undefined
      ? { depositPrice: record.depositPrice }
      : {}),
    ageRange: record.ageRange,
    images: record.images,
    createdAt: record.createdAt,
  };
}

export class ToyCatalogService {
  public constructor(
    private readonly repository: ToyCatalogRepository,
    private readonly ports: ToyCatalogPorts,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async list(query: ToyCatalogQuery): Promise<ToyCatalogPage> {
    const soldToyIds = await this.ports.getSoldToyIds();
    const filter: ToyCatalogFilter = {
      ...(query.listingType ? { listingType: query.listingType } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.minAge !== undefined ? { minAge: query.minAge } : {}),
      ...(query.maxAge !== undefined ? { maxAge: query.maxAge } : {}),
      excludeIds: soldToyIds,
    };

    const skip = (query.page - 1) * query.limit;
    const [total, records] = await Promise.all([
      this.repository.count(filter),
      query.sort === 'popular'
        ? this.findPopular(filter, skip, query.limit)
        : this.repository.findNewest(filter, skip, query.limit),
    ]);

    return { items: records.map(toPublicDto), page: query.page, limit: query.limit, total };
  }

  /**
   * Tin có đơn thuê gần đây đứng trước (nhiều đơn hơn đứng trước), phần còn lại xếp theo tin mới nhất.
   * Khi chưa có đơn thuê nào, kết quả giống hệt sort=newest.
   */
  private async findPopular(filter: ToyCatalogFilter, skip: number, limit: number): Promise<CatalogToyRecord[]> {
    const since = new Date(this.now().getTime() - POPULAR_WINDOW_DAYS * DAY_MS);
    const rentalCounts = await this.ports.getRentalCountsSince(since);

    const popularToys =
      rentalCounts.size === 0 ? [] : await this.repository.findByIds(filter, [...rentalCounts.keys()]);
    popularToys.sort(
      (a, b) =>
        (rentalCounts.get(b.id) ?? 0) - (rentalCounts.get(a.id) ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const fromPopular = popularToys.slice(skip, skip + limit);
    const remaining = limit - fromPopular.length;
    if (remaining <= 0) return fromPopular;

    const rest = await this.repository.findNewest(
      { ...filter, excludeIds: [...filter.excludeIds, ...popularToys.map((toy) => toy.id)] },
      Math.max(0, skip - popularToys.length),
      remaining,
    );

    return [...fromPopular, ...rest];
  }
}
