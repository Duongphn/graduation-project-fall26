import type { RentalNotification, RentalNotifier } from '../../interfaces/rental-order.ports.js';
import { notificationLinks } from '../../services/notification.links.js';
import { notify } from '../../utils/notify.js';

/**
 * Rental notifications through the shared notify() (UC26): saved, pushed over Socket.IO and
 * linked to the booking page of the recipient's side.
 */
export class RentalOrderNotifications implements RentalNotifier {
  public notify(n: RentalNotification): Promise<void> {
    const link = !n.orderId
      ? undefined
      : n.party === 'owner'
        ? notificationLinks.rentalRequest(n.orderId)
        : n.party === 'renter'
          ? notificationLinks.myRental(n.orderId)
          : undefined;
    notify({
      type: 'RENTAL_ORDER',
      to: n.userId,
      title: n.title,
      body: n.body,
      ...(link ? { link } : {}),
    });
    return Promise.resolve();
  }
}
