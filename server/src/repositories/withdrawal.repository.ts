import mongoose, { type ClientSession, type Model, type Types } from 'mongoose';
import WithdrawalRequest, {
  type IWithdrawalRequest,
  type WithdrawalStatus,
} from '../models/withdrawal-request.model.js';

export interface ListWithdrawalsOptions {
  page?: number | undefined;
  limit?: number | undefined;
  status?: WithdrawalStatus | 'all' | undefined;
}

export class WithdrawalRepository {
  public constructor(
    private readonly withdrawalModel: Model<IWithdrawalRequest> = WithdrawalRequest,
  ) {}

  public async findPendingByUserId(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IWithdrawalRequest | null> {
    const query = this.withdrawalModel.findOne({
      userId: new mongoose.Types.ObjectId(userId.toString()),
      status: 'pending',
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async create(
    data: Partial<IWithdrawalRequest>,
    session?: ClientSession,
  ): Promise<IWithdrawalRequest> {
    const doc = new this.withdrawalModel(data);
    return session ? doc.save({ session }) : doc.save();
  }

  public async findById(
    id: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IWithdrawalRequest | null> {
    const query = this.withdrawalModel.findById(id);
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findByCode(
    code: string,
    session?: ClientSession,
  ): Promise<IWithdrawalRequest | null> {
    const query = this.withdrawalModel.findOne({ code });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async listByUserId(
    userId: string | Types.ObjectId,
    options: ListWithdrawalsOptions = {},
  ): Promise<{ items: IWithdrawalRequest[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const queryFilter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId.toString()),
    };

    if (options.status && options.status !== 'all') {
      queryFilter.status = options.status;
    }

    const [items, total] = await Promise.all([
      this.withdrawalModel
        .find(queryFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.withdrawalModel.countDocuments(queryFilter).exec(),
    ]);

    return { items, total };
  }

  public async updateStatus(
    id: string | Types.ObjectId,
    status: WithdrawalStatus,
    processedBy?: Types.ObjectId | string,
    notes?: string,
    session?: ClientSession,
  ): Promise<IWithdrawalRequest | null> {
    const updateData: Record<string, unknown> = { status };
    if (processedBy !== undefined) {
      updateData.processedBy = new mongoose.Types.ObjectId(processedBy.toString());
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const query = this.withdrawalModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );
    if (session) {
      query.session(session);
    }
    return query.exec();
  }
}
