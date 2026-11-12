import mongoose, { type FilterQuery, type Types } from 'mongoose';

import { ADVISOR_LISTING_TYPES } from '../constants/ai-advisor.js';
import type { AdvisorCatalogPort, AdvisorUsageLogPort } from '../interfaces/ai-advisor.ports.js';
import { AiRequest } from '../models/ai-request.model.js';
import { Category } from '../models/category.model.js';
import { type IToy, Toy } from '../models/toy.model.js';
import type {
  AdvisorCategory,
  AdvisorLogEntry,
  AdvisorToyListingType,
  AdvisorToyQuery,
  AdvisorToyRecord,
} from '../types/ai-advisor.types.js';
import type { ToyCatalogPorts } from '../types/toy-catalog.types.js';

interface AdvisorLeanToy {
  _id: Types.ObjectId;
  title: string;
  description: string;
  listingType: AdvisorToyListingType;
  priceOrRate: number;
  condition: string;
  ageRange: { minAge: number; maxAge: number };
  images?: { url: string }[];
}

// Chỉ lấy các trường cần cho prompt và thẻ đồ chơi; ảnh đầu tiên làm ảnh bìa.
const ADVISOR_PROJECTION = {
  title: 1,
  description: 1,
  listingType: 1,
  priceOrRate: 1,
  condition: 1,
  ageRange: 1,
  images: { $slice: 1 },
};

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

/** Tìm đồ chơi cho trợ lý AI và ghi log AiRequest (giới hạn lượt hỏi, chi phí token). */
export class MongoAiAdvisorRepository implements AdvisorCatalogPort, AdvisorUsageLogPort {
  public constructor(private readonly catalogPorts: Pick<ToyCatalogPorts, 'getSoldToyIds'>) {}

  public async listActiveCategories(): Promise<AdvisorCategory[]> {
    // Dữ liệu develop có thể lưu trạng thái chữ hoa ('ACTIVE').
    const docs = await Category.find({ status: { $regex: '^active$', $options: 'i' } })
      .sort({ displayOrder: 1, name: 1 })
      .select({ slug: 1, name: 1 })
      .lean();
    return docs.map((doc) => ({ id: doc._id.toString(), slug: doc.slug, name: doc.name }));
  }

  public async findActive(query: AdvisorToyQuery): Promise<AdvisorToyRecord[]> {
    // BR-01: tin đã được Admin duyệt (active), chưa bán, không phải tin của người hỏi;
    // chỉ tin cho thuê hoặc đang bán, không gợi ý đồ tặng.
    const soldIds = await this.catalogPorts.getSoldToyIds();
    const filter: FilterQuery<IToy> = {
      status: 'active',
      ownerId: { $ne: toObjectId(query.excludeOwnerId) },
    };
    if (soldIds.length > 0) filter._id = { $nin: soldIds.map(toObjectId) };
    filter.listingType = query.listingType ?? { $in: [...ADVISOR_LISTING_TYPES] };
    if (query.categoryId) filter.categoryId = toObjectId(query.categoryId);
    if (query.ageYears !== null) {
      filter['ageRange.minAge'] = { $lte: query.ageYears };
      filter['ageRange.maxAge'] = { $gte: query.ageYears };
    }
    // BR-04: với tin thuê, priceOrRate là giá mỗi ngày.
    if (query.maxPrice !== null) filter.priceOrRate = { $lte: query.maxPrice };

    const docs = await Toy.find(filter, ADVISOR_PROJECTION)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit)
      .lean<AdvisorLeanToy[]>();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      listingType: doc.listingType,
      priceOrRate: doc.priceOrRate,
      condition: doc.condition,
      ageRange: { minAge: doc.ageRange.minAge, maxAge: doc.ageRange.maxAge },
      image: doc.images?.[0]?.url ?? '',
    }));
  }

  public async countSince(userId: string, since: Date): Promise<number> {
    return AiRequest.countDocuments({
      user_id: toObjectId(userId),
      request_type: 'advisor',
      status: { $ne: 'faq' },
      createdAt: { $gte: since },
    });
  }

  public async record(entry: AdvisorLogEntry): Promise<void> {
    await AiRequest.create({
      user_id: toObjectId(entry.userId),
      request_type: 'advisor',
      status: entry.status,
      prompt: entry.prompt,
      response: entry.response,
      token_usage: entry.tokenUsage,
      latency_ms: entry.latencyMs,
      ...(entry.modelName ? { model_name: entry.modelName } : {}),
    });
  }
}
