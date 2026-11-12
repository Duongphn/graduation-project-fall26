import mongoose, { type Model, type Types } from 'mongoose';
import Notification, { type INotification } from '../models/notification.model.js';

export class NotificationRepository {
  public constructor(
    private readonly notificationModel: Model<INotification> = Notification,
  ) {}

  public async create(data: {
    userId: Types.ObjectId | string;
    title: string;
    body: string;
    type: string;
  }): Promise<INotification> {
    return this.notificationModel.create({
      userId: new mongoose.Types.ObjectId(data.userId.toString()),
      title: data.title,
      body: data.body,
      type: data.type,
      isRead: false,
    });
  }

  public async listByUserId(
    userId: Types.ObjectId | string,
    limit = 20,
  ): Promise<INotification[]> {
    return this.notificationModel
      .find({ userId: new mongoose.Types.ObjectId(userId.toString()) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
