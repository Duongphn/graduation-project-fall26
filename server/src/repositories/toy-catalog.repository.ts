import mongoose, { type FilterQuery, type Model } from 'mongoose';
import PurchaseOrder from '../models/purchase-order.model.js';
import RentalOrder from '../models/rental-order.model.js';
import { Toy, type IToy } from '../models/toy.model.js';
import { toRatingSummary } from '../services/review.mapper.js';
import type {
  CatalogToyRecord,
  ToyCatalogFilter,
  ToyCatalogPorts,
  ToyCatalogRepository,
} from '../types/toy-catalog.types.js';

/** Chỉ lấy các trường cần cho danh sách công khai */
const CATALOG_PROJECTION = {
  categoryId: 1,
  title: 1,
  condition: 1,
  listingType: 1,
  priceOrRate: 1,
  depositPrice: 1,
  ageRange: 1,
  'images.url': 1,
  createdAt: 1,
  rating: 1,
} as const;

type CatalogLeanToy = Pick<
  IToy,
  'categoryId' | 'title' | 'condition' | 'listingType' | 'priceOrRate' | 'depositPrice' | 'ageRange' | 'createdAt' | 'rating'
> & { _id: mongoose.Types.ObjectId; images?: { url: string }[] };

const toObjectIds = (ids: string[]) =>
  ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

function buildQuery(filter: ToyCatalogFilter): FilterQuery<IToy> {
  const query: FilterQuery<IToy> = { status: 'active' };

  if (filter.listingType) query.listingType = filter.listingType;
  if (filter.categoryId) query.categoryId = new mongoose.Types.ObjectId(filter.categoryId);
  // Khoảng tuổi của đồ chơi giao với khoảng tuổi cần tìm. Both ranges are half-open
  // [minAge, maxAge) (R03 S3 age groups: a 1-3 toy is not in the 3-6 group); a toy or a query
  // for one age only (minAge === maxAge) counts as [minAge, minAge + 1), as in ageRangesOverlap.
  if (filter.maxAge !== undefined) {
    const upper =
      filter.minAge !== undefined ? Math.max(filter.maxAge, filter.minAge + 1) : filter.maxAge;
    query['ageRange.minAge'] = { $lt: upper };
  }
  if (filter.minAge !== undefined) {
    query.$or = [
      { 'ageRange.maxAge': { $gt: filter.minAge } },
      { 'ageRange.minAge': { $gte: filter.minAge } },
    ];
  }
  if (filter.excludeIds.length > 0) query._id = { $nin: toObjectIds(filter.excludeIds) };

  return query;
}

function toRecord(doc: CatalogLeanToy): CatalogToyRecord {
  return {
    id: doc._id.toString(),
    categoryId: doc.categoryId.toString(),
    title: doc.title,
    condition: doc.condition,
    listingType: doc.listingType,
    priceOrRate: doc.priceOrRate,
    depositPrice: doc.depositPrice,
    ageRange: { minAge: doc.ageRange.minAge, maxAge: doc.ageRange.maxAge },
    images: (doc.images ?? []).map((image) => ({ url: image.url })),
    createdAt: doc.createdAt,
    rating: toRatingSummary(doc.rating),
  };
}

export class MongoToyCatalogRepository implements ToyCatalogRepository {
  public constructor(private readonly toyModel: Model<IToy> = Toy) {}

  public async count(filter: ToyCatalogFilter): Promise<number> {
    return this.toyModel.countDocuments(buildQuery(filter));
  }

  public async findNewest(filter: ToyCatalogFilter, skip: number, limit: number): Promise<CatalogToyRecord[]> {
    if (limit <= 0) return [];

    const docs = await this.toyModel
      .find(buildQuery(filter), CATALOG_PROJECTION)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean<CatalogLeanToy[]>();

    return docs.map(toRecord);
  }

  public async findByIds(filter: ToyCatalogFilter, ids: string[]): Promise<CatalogToyRecord[]> {
    const objectIds = toObjectIds(ids);
    if (objectIds.length === 0) return [];

    const query = buildQuery(filter);
    // Gộp với điều kiện loại trừ (nếu có) thay vì ghi đè
    query._id = { ...(query._id as object | undefined), $in: objectIds };

    const docs = await this.toyModel.find(query, CATALOG_PROJECTION).lean<CatalogLeanToy[]>();
    return docs.map(toRecord);
  }
}

// Cùng quy tắc với createToyListingPorts (repositories/toy-listing.repository.ts)
const COMPLETED_STATUS_REGEX = /^completed$/i;
const NOT_COUNTED_RENTAL_STATUS_REGEX = /^(rejected|cancell?ed|expired)$/i;

/** Truy vấn đơn hàng cần cho danh sách trang chủ: tin đã bán và số đơn thuê gần đây */
export function createToyCatalogPorts(): ToyCatalogPorts {
  return {
    async getSoldToyIds(): Promise<string[]> {
      const toyIds = await PurchaseOrder.distinct('toyId', {
        status: { $regex: COMPLETED_STATUS_REGEX },
      });
      return toyIds.map((toyId) => toyId.toString());
    },

    async getRentalCountsSince(since: Date): Promise<Map<string, number>> {
      const rows = await RentalOrder.aggregate<{ _id: unknown; count: number }>([
        { $match: { createdAt: { $gte: since }, status: { $not: NOT_COUNTED_RENTAL_STATUS_REGEX } } },
        { $group: { _id: '$toyId', count: { $sum: 1 } } },
      ]);
      return new Map(rows.map((row) => [String(row._id), row.count]));
    },
  };
}
