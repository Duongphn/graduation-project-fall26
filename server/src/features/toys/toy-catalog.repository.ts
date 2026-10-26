import mongoose, { type FilterQuery, type Model } from 'mongoose';
import { Toy, type IToy } from '../../models/toy.model.js';
import type { CatalogToyRecord, ToyCatalogFilter, ToyCatalogRepository } from '../../types/toy-catalog.types.js';

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
} as const;

type CatalogLeanToy = Pick<
  IToy,
  'categoryId' | 'title' | 'condition' | 'listingType' | 'priceOrRate' | 'depositPrice' | 'ageRange' | 'createdAt'
> & { _id: mongoose.Types.ObjectId; images?: { url: string }[] };

const toObjectIds = (ids: string[]) =>
  ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

function buildQuery(filter: ToyCatalogFilter): FilterQuery<IToy> {
  const query: FilterQuery<IToy> = { status: 'active' };

  if (filter.listingType) query.listingType = filter.listingType;
  if (filter.categoryId) query.categoryId = new mongoose.Types.ObjectId(filter.categoryId);
  // Khoảng tuổi của đồ chơi giao với khoảng tuổi cần tìm
  if (filter.maxAge !== undefined) query['ageRange.minAge'] = { $lte: filter.maxAge };
  if (filter.minAge !== undefined) query['ageRange.maxAge'] = { $gte: filter.minAge };
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
