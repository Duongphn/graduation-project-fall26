import { type ClientSession, type FilterQuery, type Model, Types } from 'mongoose';
import {
  TERMINAL_RENTAL_STATUSES,
  type RentalOrderStatus,
  type RentalTimerKind,
} from '../constants/rental-order-status.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';
import {
  type IRentalOrder,
  RentalOrder,
  type RentalOrderDoc,
} from '../models/rental-order.model.js';
import { type IToy, Toy } from '../models/toy.model.js';
import { type IUser, User } from '../models/user.model.js';
import { vnToday } from '../services/rental-time.js';
import {
  type RentalCounterpartDto,
  type RentalPeriod,
  type RentalToySummaryDto,
} from '../types/rental-order.types.js';
import { slugify } from '../utils/slug.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type EnrichedRentalOrderDoc = RentalOrderDoc & {
  role: 'renter' | 'owner' | 'admin';
  toy?: RentalToySummaryDto | undefined;
  counterpart?: RentalCounterpartDto | undefined;
  // Chỉ có khi admin xem đơn mà mình không tham gia (role=all)
  renter?: RentalCounterpartDto | undefined;
  owner?: RentalCounterpartDto | undefined;
};

export class RentalOrderRepository {
  private readonly model: Model<IRentalOrder>;
  private readonly toyModel: Model<IToy>;
  private readonly userModel: Model<IUser>;

  public constructor(
    model: Model<IRentalOrder> = RentalOrder,
    toyModel: Model<IToy> = Toy,
    userModel: Model<IUser> = User,
  ) {
    this.model = model;
    this.toyModel = toyModel;
    this.userModel = userModel;
  }

  public async findOccupied(
    toyId: string,
    from: Date,
    to: Date,
    session?: ClientSession,
  ): Promise<RentalPeriod[]> {
    const docs = await this.model
      .find({
        toyId: new Types.ObjectId(toyId),
        status: { $nin: TERMINAL_RENTAL_STATUSES },
        'period.startDate': { $lte: to },
        'period.endDate': { $gte: from },
      })
      .select('period')
      .sort({ 'period.startDate': 1 })
      .session(session ?? null)
      .lean();

    return docs.map((d) => ({
      startDate: d.period.startDate,
      endDate: d.period.endDate,
    }));
  }

  public async listForParty(
    userId: string,
    role: 'renter' | 'owner' | 'all',
    status: RentalOrderStatus | RentalOrderStatus[] | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: EnrichedRentalOrderDoc[]; total: number }> {
    const filter: FilterQuery<IRentalOrder> = {};

    if (role === 'renter') {
      filter.renterId = new Types.ObjectId(userId);
    } else if (role === 'owner') {
      filter.ownerId = new Types.ObjectId(userId);
    }

    if (status !== undefined) {
      if (Array.isArray(status)) {
        filter.status = { $in: status };
      } else {
        filter.status = status;
      }
    }

    const skip = Math.max(0, (page - 1) * limit);

    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
      this.model.countDocuments(filter),
    ]);

    if (items.length === 0) {
      return { items: [], total };
    }

    const viewerRoleOf = (item: RentalOrderDoc): 'renter' | 'owner' | 'admin' => {
      if (role !== 'all') return role;
      if (item.ownerId.toString() === userId) return 'owner';
      if (item.renterId.toString() === userId) return 'renter';
      return 'admin';
    };

    const toyIds = new Set<string>();
    const counterpartUserIds = new Set<string>();

    for (const item of items) {
      toyIds.add(item.toyId.toString());

      const viewerRole = viewerRoleOf(item);
      if (viewerRole !== 'owner') counterpartUserIds.add(item.ownerId.toString());
      if (viewerRole !== 'renter') counterpartUserIds.add(item.renterId.toString());
    }

    const [toys, users] = await Promise.all([
      this.toyModel
        .find({
          _id: { $in: Array.from(toyIds).map((id) => new Types.ObjectId(id)) },
        })
        .lean(),
      this.userModel
        .find({
          _id: { $in: Array.from(counterpartUserIds).map((id) => new Types.ObjectId(id)) },
        })
        .lean(),
    ]);

    const toyMap = new Map<string, (typeof toys)[number]>();
    for (const toy of toys) {
      toyMap.set(toy._id.toString(), toy);
    }

    const userMap = new Map<string, (typeof users)[number]>();
    for (const user of users) {
      userMap.set(user._id.toString(), user);
    }

    const toPartyDto = (
      id: string,
      partyRole: 'renter' | 'owner',
    ): RentalCounterpartDto | undefined => {
      const userDoc = userMap.get(id);
      if (!userDoc) return undefined;
      return {
        id: userDoc._id.toString(),
        fullName: userDoc.fullName,
        avatar: userDoc.avatar ?? undefined,
        trustScore: userDoc.trust?.score ?? undefined,
        verified: userDoc.verificationStatus === 'verified',
        role: partyRole,
      };
    };

    const enrichedItems: EnrichedRentalOrderDoc[] = items.map((item) => {
      const itemRole = viewerRoleOf(item);

      const toyDoc = toyMap.get(item.toyId.toString());
      let toySummary: RentalToySummaryDto | undefined;
      if (toyDoc) {
        const images = (toyDoc.images ?? []) as ToyImage[];
        toySummary = {
          id: toyDoc._id.toString(),
          name: toyDoc.title,
          slug: (toyDoc as { slug?: string }).slug || slugify(toyDoc.title, { fallback: 'toy' }),
          primaryImage: images[0]?.url,
          images,
          dailyRate: toyDoc.priceOrRate,
          depositAmount: toyDoc.depositPrice ?? 0,
        };
      }

      const enrichedDoc = item as EnrichedRentalOrderDoc;
      enrichedDoc.role = itemRole;
      enrichedDoc.toy = toySummary;
      if (itemRole === 'admin') {
        enrichedDoc.renter = toPartyDto(item.renterId.toString(), 'renter');
        enrichedDoc.owner = toPartyDto(item.ownerId.toString(), 'owner');
      } else {
        enrichedDoc.counterpart =
          itemRole === 'owner'
            ? toPartyDto(item.renterId.toString(), 'renter')
            : toPartyDto(item.ownerId.toString(), 'owner');
      }

      return enrichedDoc;
    });

    return { items: enrichedItems, total };
  }

  public async findDue(
    now: Date,
    limit: number,
  ): Promise<{ id: string; kind: RentalTimerKind }[]> {
    // Chỉ cần id và loại timer; các hàm xử lý tự đọc lại đơn với điều kiện của riêng chúng
    const docs = await this.model
      .find({ 'timer.dueAt': { $lte: now } })
      .select('timer.kind')
      .sort({ 'timer.dueAt': 1 })
      .limit(limit)
      .lean();

    return docs.flatMap((d) =>
      d.timer?.kind ? [{ id: d._id.toString(), kind: d.timer.kind }] : [],
    );
  }

  public generateCode(now: Date): string {
    const vt = vnToday(now);
    const yy = String(vt.getUTCFullYear()).slice(-2);
    const MM = String(vt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(vt.getUTCDate()).padStart(2, '0');

    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }

    return `RO${yy}${MM}${dd}${randomPart}`;
  }
}
