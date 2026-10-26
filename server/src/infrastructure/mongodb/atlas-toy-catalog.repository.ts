import mongoose, { type Model } from 'mongoose';
import { Category, type ICategory } from '../../features/categories/categories.model.js';
import {
  PurchaseOrder,
  type IPurchaseOrder,
} from '../../features/purchase_orders/purchase_orders.model.js';
import {
  RentalOrder,
  type IRentalOrder,
} from '../../features/rental_orders/rental_orders.model.js';
import { Toy, type IToy } from '../../features/toys/toys.model.js';
import { User, type IUser } from '../../features/users/users.model.js';
import { AppError } from '../../utils/app-error.js';
import type {
  OccupiedRentalPeriod,
  ToyCardDto,
  ToyCatalogReadPort,
  ToyDetailDto,
  ToySearchQuery,
} from '../../interfaces/toy-catalog.ports.js';

export interface AtlasToyCatalogRepositoryDependencies {
  toyModel?: Model<IToy>;
  categoryModel?: Model<ICategory>;
  userModel?: Model<IUser>;
  purchaseOrderModel?: Model<IPurchaseOrder>;
  rentalOrderModel?: Model<IRentalOrder>;
}

const TERMINAL_ORDER_STATUS_REGEX = /^(completed|rejected|cancell?ed|expired)$/i;

interface AggregationToyDoc {
  _id: mongoose.Types.ObjectId;
  title: string;
  images?: Array<{ url: string; publicId: string }>;
  listingType: 'rent' | 'sell';
  priceOrRate: number;
  depositPrice?: number;
  categoryId: mongoose.Types.ObjectId;
  categoryDoc?: {
    _id: mongoose.Types.ObjectId;
    name: string;
    slug: string;
  };
  ageRange?: {
    minAge: number;
    maxAge: number;
  };
  condition: string;
  location?: {
    type?: string;
    coordinates?: [number, number];
  };
  createdAt: Date | string;
}

export class AtlasToyCatalogRepository implements ToyCatalogReadPort {
  private readonly toyModel: Model<IToy>;
  private readonly categoryModel: Model<ICategory>;
  private readonly userModel: Model<IUser>;
  private readonly purchaseOrderModel: Model<IPurchaseOrder>;
  private readonly rentalOrderModel: Model<IRentalOrder>;

  public constructor(deps: AtlasToyCatalogRepositoryDependencies = {}) {
    this.toyModel = deps.toyModel ?? Toy;
    this.categoryModel = deps.categoryModel ?? Category;
    this.userModel = deps.userModel ?? User;
    this.purchaseOrderModel = deps.purchaseOrderModel ?? PurchaseOrder;
    this.rentalOrderModel = deps.rentalOrderModel ?? RentalOrder;
  }

  public async search(query: ToySearchQuery): Promise<{ items: ToyCardDto[]; total: number }> {
    const filterClauses: Record<string, unknown>[] = [
      {
        equals: {
          path: 'status',
          value: 'active',
        },
      },
    ];

    if (query.type) {
      filterClauses.push({
        equals: {
          path: 'listingType',
          value: query.type,
        },
      });
    }

    if (query.categoryId) {
      filterClauses.push({
        equals: {
          path: 'categoryId',
          value: new mongoose.Types.ObjectId(query.categoryId),
        },
      });
    }

    // Price range
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const priceRange: { path: string; gte?: number; lte?: number } = { path: 'priceOrRate' };
      if (query.minPrice !== undefined) priceRange.gte = query.minPrice;
      if (query.maxPrice !== undefined) priceRange.lte = query.maxPrice;
      filterClauses.push({ range: priceRange });
    }

    // Age overlap: listing.minAge <= query.ageMax AND listing.maxAge >= query.ageMin
    if (query.ageMax !== undefined) {
      filterClauses.push({
        range: {
          path: 'ageRange.minAge',
          lte: query.ageMax,
        },
      });
    }
    if (query.ageMin !== undefined) {
      filterClauses.push({
        range: {
          path: 'ageRange.maxAge',
          gte: query.ageMin,
        },
      });
    }

    // Geospatial filter: geoWithin
    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm !== undefined) {
      filterClauses.push({
        geoWithin: {
          path: 'location',
          circle: {
            center: {
              type: 'Point',
              coordinates: [query.lng, query.lat],
            },
            radius: query.radiusKm * 1000,
          },
        },
      });
    }

    const mustClauses: Record<string, unknown>[] = [];
    if (query.q) {
      mustClauses.push({
        text: {
          query: query.q,
          path: ['title', 'description'],
        },
      });
    }

    const compoundClause: Record<string, unknown> = {
      filter: filterClauses,
    };
    if (mustClauses.length > 0) {
      compoundClause.must = mustClauses;
    }

    // Distance near scoring when distance sort is specified
    if (query.sort === 'distance' && query.lat !== undefined && query.lng !== undefined) {
      compoundClause.should = [
        {
          near: {
            path: 'location',
            origin: {
              type: 'Point',
              coordinates: [query.lng, query.lat],
            },
            pivot: 1000,
          },
        },
      ];
    }

    const searchStage = {
      $search: {
        index: 'toys_search',
        compound: compoundClause,
      },
    };

    // Sort stage
    let sortStage: Record<string, unknown>;
    switch (query.sort) {
      case 'newest':
        sortStage = { $sort: { createdAt: -1, _id: -1 } };
        break;
      case 'price_asc':
        sortStage = { $sort: { priceOrRate: 1, _id: -1 } };
        break;
      case 'price_desc':
        sortStage = { $sort: { priceOrRate: -1, _id: -1 } };
        break;
      case 'distance':
      case 'relevance':
      default:
        sortStage = { $sort: { score: { $meta: 'searchScore' }, _id: -1 } };
        break;
    }

    const purchaseCollectionName = this.purchaseOrderModel.collection.name;
    const categoryCollectionName = this.categoryModel.collection.name;

    const pipeline: mongoose.PipelineStage[] = [
      searchStage as unknown as mongoose.PipelineStage,
      {
        $lookup: {
          from: purchaseCollectionName,
          let: { toyId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$toyId', '$$toyId'] },
                    {
                      $regexMatch: {
                        input: '$status',
                        regex: /^completed$/i,
                      },
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'completedPurchases',
        },
      },
      {
        $match: {
          completedPurchases: { $size: 0 },
        },
      },
      sortStage as unknown as mongoose.PipelineStage,
      {
        $lookup: {
          from: categoryCollectionName,
          localField: 'categoryId',
          foreignField: '_id',
          as: 'categoryDoc',
        },
      },
      {
        $unwind: {
          path: '$categoryDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        },
      },
    ];

    try {
      const [result] = (await this.toyModel.aggregate(pipeline).exec()) as [
        { metadata: Array<{ total: number }>; data: AggregationToyDoc[] },
      ];

      const total = result?.metadata[0]?.total ?? 0;
      const data = result?.data ?? [];

      const items: ToyCardDto[] = data.map((doc) => {
        const firstImage = doc.images?.[0];
        return {
          id: doc._id.toString(),
          title: doc.title,
          primaryImage: firstImage ? { url: firstImage.url, publicId: firstImage.publicId } : null,
          listingType: doc.listingType,
          priceOrRate: doc.priceOrRate,
          depositPrice: doc.listingType === 'rent' ? (doc.depositPrice ?? 0) : null,
          category: {
            id: doc.categoryDoc?._id?.toString() || doc.categoryId.toString(),
            name: doc.categoryDoc?.name || '',
            slug: doc.categoryDoc?.slug || '',
          },
          ageRange: {
            minAge: doc.ageRange?.minAge ?? 0,
            maxAge: doc.ageRange?.maxAge ?? 0,
          },
          condition: doc.condition,
          location: doc.location?.coordinates
            ? {
                type: doc.location.type || 'Point',
                coordinates: doc.location.coordinates as [number, number],
              }
            : null,
          createdAt:
            doc.createdAt instanceof Date
              ? doc.createdAt.toISOString()
              : new Date(doc.createdAt).toISOString(),
        };
      });

      return { items, total };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(500, 'SEARCH_EXECUTION_ERROR', `Search operation failed: ${message}`);
    }
  }

  public async findActiveDetail(toyId: string): Promise<ToyDetailDto | null> {
    if (!mongoose.Types.ObjectId.isValid(toyId)) {
      return null;
    }

    const toy = await this.toyModel.findOne({ _id: toyId, status: 'active' }).lean();
    if (!toy) {
      return null;
    }

    // Exclude if sold through completed purchase
    const isSold = await this.purchaseOrderModel.exists({
      toyId: toy._id,
      status: { $regex: /^completed$/i },
    });
    if (isSold) {
      return null;
    }

    const [category, owner] = await Promise.all([
      this.categoryModel.findById(toy.categoryId).lean(),
      this.userModel.findById(toy.ownerId).select('_id fullName').lean(),
    ]);

    return {
      id: toy._id.toString(),
      title: toy.title,
      description: toy.description,
      images: Array.isArray(toy.images)
        ? toy.images.map((img) => ({ url: img.url, publicId: img.publicId }))
        : [],
      listingType: toy.listingType as 'rent' | 'sell',
      priceOrRate: toy.priceOrRate,
      depositPrice: toy.listingType === 'rent' ? (toy.depositPrice ?? 0) : null,
      category: {
        id: category?._id.toString() || toy.categoryId.toString(),
        name: category?.name || '',
        slug: category?.slug || '',
      },
      ageRange: {
        minAge: toy.ageRange?.minAge ?? 0,
        maxAge: toy.ageRange?.maxAge ?? 0,
      },
      condition: toy.condition,
      location: toy.location?.coordinates
        ? {
            type: toy.location.type || 'Point',
            coordinates: toy.location.coordinates as [number, number],
          }
        : null,
      owner: {
        id: owner?._id.toString() || toy.ownerId.toString(),
        displayName: owner?.fullName || 'Anonymous',
      },
      createdAt:
        toy.createdAt instanceof Date
          ? toy.createdAt.toISOString()
          : new Date(toy.createdAt).toISOString(),
      updatedAt:
        toy.updatedAt instanceof Date
          ? toy.updatedAt.toISOString()
          : new Date(toy.updatedAt).toISOString(),
    };
  }

  public async findAvailability(
    toyId: string,
    from: Date,
    toInclusive: Date,
  ): Promise<OccupiedRentalPeriod[]> {
    if (!mongoose.Types.ObjectId.isValid(toyId)) {
      return [];
    }

    const toy = await this.toyModel.findOne({ _id: toyId, status: 'active' }).lean();
    if (!toy) {
      return [];
    }

    // Sell listings have no rental availability periods
    if (toy.listingType === 'sell') {
      return [];
    }

    const isSold = await this.purchaseOrderModel.exists({
      toyId: toy._id,
      status: { $regex: /^completed$/i },
    });
    if (isSold) {
      return [];
    }

    const orders = await this.rentalOrderModel
      .find({
        toyId: toy._id,
        status: { $not: TERMINAL_ORDER_STATUS_REGEX },
        'period.startDate': { $lte: toInclusive },
        'period.endDate': { $gte: from },
      })
      .select('period.startDate period.endDate')
      .sort({ 'period.startDate': 1 })
      .lean();

    return orders.map((order) => {
      const start =
        order.period.startDate instanceof Date
          ? order.period.startDate
          : new Date(order.period.startDate);
      const end =
        order.period.endDate instanceof Date
          ? order.period.endDate
          : new Date(order.period.endDate);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    });
  }
}
