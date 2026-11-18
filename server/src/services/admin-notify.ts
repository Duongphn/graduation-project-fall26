import { type Model } from 'mongoose';
import { type RentalNotifier } from '../interfaces/rental-order.ports.js';
import { type IUser } from '../models/user.model.js';

/** Notifies every admin; like notifyParty, a failed notification must not undo a committed action. */
export async function notifyAdmins(
  notifier: RentalNotifier,
  userModel: Model<IUser>,
  title: string,
  body: string,
): Promise<void> {
  try {
    const admins = await userModel.find({ role: 'ADMIN' }).select('_id').lean();
    await Promise.all(
      admins.map((admin) =>
        notifier.notify({ userId: admin._id.toString(), title, body }).catch(() => {}),
      ),
    );
  } catch {
    // Swallows error
  }
}
