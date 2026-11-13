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

export interface AdminListWithdrawalsOptions {
  page?: number | undefined;
  limit?: number | undefined;
  status?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
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

  public async listForAdmin(
    options: AdminListWithdrawalsOptions = {},
  ): Promise<{ items: IWithdrawalRequest[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const queryFilter: Record<string, unknown> = {};

    if (options.status && options.status !== 'all') {
      queryFilter.status = options.status;
    }

    if (options.startDate || options.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (options.startDate) {
        dateFilter.$gte = options.startDate;
      }
      if (options.endDate) {
        dateFilter.$lte = options.endDate;
      }
      queryFilter.createdAt = dateFilter;
    }

    const sortOrder = options.status === 'pending' ? { createdAt: 1 } : { createdAt: -1 };

    const [items, total] = await Promise.all([
      this.withdrawalModel
        .find(queryFilter)
        .populate('userId', 'fullName email phone avatar')
        .sort(sortOrder as Record<string, 1 | -1>)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.withdrawalModel.countDocuments(queryFilter).exec(),
    ]);

    return { items, total };
  }

  public async atomicProcessPending(
    id: string | Types.ObjectId,
    updateData: {
      status: WithdrawalStatus;
      processedBy: Types.ObjectId | string;
      processedAt?: Date | undefined;
      notes?: string | undefined;
    },
    session?: ClientSession,
  ): Promise<IWithdrawalRequest | null> {
    const query = this.withdrawalModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id.toString()),
        status: 'pending',
      },
      {
        $set: {
          status: updateData.status,
          processedBy: new mongoose.Types.ObjectId(updateData.processedBy.toString()),
          processedAt: updateData.processedAt ?? new Date(),
          ...(updateData.notes !== undefined ? { notes: updateData.notes } : {}),
        },
      },
      { new: true, ...(session ? { session } : {}) },
    );

    return query.exec();
  }
}


