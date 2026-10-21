import { AppError } from '../../shared/errors/app-error.js';
import type {
  OccupiedRentalPeriod,
  SearchSuggestion,
  ToyCatalogReadPort,
  ToyDetailDto,
  ToySearchQuery,
  ToySearchResult,
} from './toy-catalog.ports.js';

export class ToyCatalogService {
  public constructor(private readonly readPort: ToyCatalogReadPort) {}

  public async search(query: ToySearchQuery): Promise<ToySearchResult> {
    const { items, total } = await this.readPort.search(query);

    const suggestions: SearchSuggestion[] = [];
    if (items.length === 0) {
      if (query.q) {
        suggestions.push({
          filter: 'keyword',
          action: 'remove',
          message: 'Thử xóa từ khóa tìm kiếm để xem nhiều kết quả hơn.',
        });
      }

      if (query.categoryId) {
        suggestions.push({
          filter: 'category',
          action: 'remove',
          message: 'Thử tìm kiếm trong tất cả danh mục.',
        });
      }

      if (query.type) {
        suggestions.push({
          filter: 'type',
          action: 'remove',
          message: 'Thử tìm cả đồ chơi cho thuê và bán.',
        });
      }

      if (query.ageMin !== undefined || query.ageMax !== undefined) {
        suggestions.push({
          filter: 'ageRange',
          action: 'widen',
          message: 'Thử mở rộng độ tuổi phù hợp.',
        });
      }

      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        suggestions.push({
          filter: 'priceRange',
          action: 'widen',
          message: 'Thử mở rộng khoảng giá tìm kiếm.',
        });
      }

      if (query.radiusKm !== undefined) {
        suggestions.push({
          filter: 'area',
          action: 'increaseRadius',
          message: 'Thử tăng bán kính tìm kiếm khu vực.',
        });
      }
    }

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      suggestions,
    };
  }

  public async getDetail(toyId: string): Promise<ToyDetailDto> {
    const detail = await this.readPort.findActiveDetail(toyId);
    if (!detail) {
      throw new AppError(404, 'NOT_FOUND', 'Toy listing not found or not active.');
    }
    return detail;
  }

  public async getAvailability(
    toyId: string,
    from: Date,
    to: Date,
  ): Promise<{ periods: OccupiedRentalPeriod[] }> {
    // Verify listing is active and available
    const detail = await this.readPort.findActiveDetail(toyId);
    if (!detail) {
      throw new AppError(404, 'NOT_FOUND', 'Toy listing not found or not active.');
    }

    const periods = await this.readPort.findAvailability(toyId, from, to);
    return { periods };
  }
}
