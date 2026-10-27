import { type ClientSession, type FilterQuery, type Model, Types } from 'mongoose';
import {
  TERMINAL_RENTAL_STATUSES,
  type RentalOrderStatus,
  type RentalTimerKind,
} from '../constants/rental-order-status.js';
import {
  type IRentalOrder,
  RentalOrder,
  type RentalOrderDoc,
} from '../models/rental-order.model.js';
import { vnToday } from '../services/rental-time.js';
import { type RentalPeriod } from '../types/rental-order.types.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RentalOrderRepository {
  private readonly model: Model<IRentalOrder>;

  public constructor(model: Model<IRentalOrder> = RentalOrder) {
    this.model = model;
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
    role: 'renter' | 'owner',
    status: RentalOrderStatus | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: RentalOrderDoc[]; total: number }> {
    const filter: FilterQuery<IRentalOrder> = {
      ...(role === 'renter'
        ? { renterId: new Types.ObjectId(userId) }
        : { ownerId: new Types.ObjectId(userId) }),
      ...(status ? { status } : {}),
    };

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
      this.model.countDocuments(filter),
    ]);

    return { items, total };
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
