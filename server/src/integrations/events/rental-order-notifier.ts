import mongoose, { type Model } from 'mongoose';
import {
  type RentalNotification,
  type RentalNotifier,
} from '../../interfaces/rental-order.ports.js';
import { type INotification, Notification } from '../../models/notification.model.js';

export class NotificationRentalNotifier implements RentalNotifier {
  private readonly notificationModel: Model<INotification>;

  public constructor(notificationModel: Model<INotification> = Notification) {
    this.notificationModel = notificationModel;
  }

  public async notify(n: RentalNotification): Promise<void> {
    try {
      await this.notificationModel.create({
        userId: new mongoose.Types.ObjectId(n.userId),
        title: n.title,
        body: n.body,
        type: 'RENTAL_ORDER',
        isRead: false,
      });
    } catch {
      // Swallows notification errors
    }
  }
}
