import type { ClientSession, Types } from 'mongoose';
import { Payment, type IPayment, type PaymentStatus } from '../models/payment.model.js';

export class PaymentRepository {
  public async create(data: Partial<IPayment>, session?: ClientSession): Promise<IPayment> {
    const doc = new Payment(data);
    return session ? doc.save({ session }) : doc.save();
  }

  public async findByCode(code: string, session?: ClientSession): Promise<IPayment | null> {
    const query = Payment.findOne({ code });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findById(id: Types.ObjectId | string, session?: ClientSession): Promise<IPayment | null> {
    const query = Payment.findById(id);
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async updateStatus(
    code: string,
    status: PaymentStatus,
    gatewayTransactionNo?: string,
    session?: ClientSession,
  ): Promise<IPayment | null> {
    const updateData: Record<string, unknown> = { status };
    if (gatewayTransactionNo !== undefined) {
      updateData.gatewayTransactionNo = gatewayTransactionNo;
    }

    const query = Payment.findOneAndUpdate(
      { code },
      { $set: updateData },
      { new: true },
    );
    if (session) {
      query.session(session);
    }
    return query.exec();
  }
}
