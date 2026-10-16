import type { Types } from 'mongoose';

import type {
  UserStatus,
  IdentityStatus,
  VerificationStatus,
} from '../../../shared/domain/statuses.js';
import { ageInYears, toIsoString } from '../../../shared/utils/dates.js';
import { maskPhone } from '../../../shared/utils/phone.js';
import { maskEmail } from '../../../shared/utils/privacy.js';

// Database documents -> response DTOs. Images are never part of these shapes.

export interface ReviewUser {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth?: Date | null;
  status: UserStatus;
  lock?: { until?: Date | null } | null;
  identityStatus: IdentityStatus;
  createdAt: Date;
}

export interface VerificationSummary {
  _id: Types.ObjectId;
  status: VerificationStatus;
  createdAt: Date;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  rejectReason?: string | null;
}

export const isLocked = (user: Pick<ReviewUser, 'status' | 'lock'>, now: Date): boolean =>
  user.status === 'LOCKED' || Boolean(user.lock?.until && user.lock.until > now);

export const toQueueUser = (user: ReviewUser, now: Date) => ({
  id: String(user._id),
  fullName: user.fullName,
  maskedPhone: maskPhone(user.phone),
  maskedEmail: maskEmail(user.email),
  age: user.dateOfBirth ? ageInYears(user.dateOfBirth, now) : null,
});

export const toDetailUser = (user: ReviewUser, now: Date) => ({
  ...toQueueUser(user, now),
  dateOfBirth: toIsoString(user.dateOfBirth),
  identityStatus: user.identityStatus,
  accountStatus: user.status,
  locked: isLocked(user, now),
  joinedAt: user.createdAt.toISOString(),
});

export const toVerificationSummary = (verification: VerificationSummary) => ({
  id: String(verification._id),
  status: verification.status,
  submittedAt: verification.createdAt.toISOString(),
  reviewedAt: toIsoString(verification.reviewedAt),
  rejectReason: verification.rejectReason ?? null,
});
