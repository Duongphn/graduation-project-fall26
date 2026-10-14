import { Types } from 'mongoose';

import { UserModel } from '../../features/users/users.model.js';
import type { UserRole, UserStatus } from '../../shared/domain/statuses.js';

export interface DevAuthUser {
  role: UserRole;
  status: UserStatus;
  lockedUntil?: Date;
}

/**
 * The account behind an x-dev-user-id header (development auth only): its real role and
 * status, or null when no such user exists.
 */
export const findDevAuthUser = async (userId: string): Promise<DevAuthUser | null> => {
  const user = await UserModel.findById(new Types.ObjectId(userId))
    .select({ role: 1, status: 1, lock: 1 })
    .lean();
  if (!user) return null;
  return {
    role: user.role,
    status: user.status,
    ...(user.lock?.until ? { lockedUntil: user.lock.until } : {}),
  };
};
