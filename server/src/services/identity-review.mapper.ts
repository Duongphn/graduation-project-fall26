import type { Types } from 'mongoose';

import { toIsoString } from '../utils/dates.js';
import { maskPhone } from '../utils/phone.js';
import { maskEmail } from '../utils/privacy.js';
import type { UserVerificationStatus, VerificationStatus } from '../interfaces/identity-verification.ports.js';

// Database documents (develop's users / identity_verifications) -> response DTOs.
// Images are never part of these shapes.

export interface ReviewUser {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  email: string;
  status: 'ACTIVE' | 'LOCKED';
  lock?: { until?: Date | null } | null;
  verificationStatus: UserVerificationStatus;
  createdAt: Date;
}

export interface VerificationSummary {
  _id: Types.ObjectId;
  status: VerificationStatus;
  submittedAt: Date;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  rejectionReason?: string | null;
}

export const isLocked = (user: Pick<ReviewUser, 'status' | 'lock'>, now: Date): boolean =>
  user.status === 'LOCKED' || Boolean(user.lock?.until && user.lock.until > now);

export const toQueueUser = (user: ReviewUser) => ({
  id: String(user._id),
  fullName: user.fullName,
  maskedPhone: maskPhone(user.phone),
  maskedEmail: maskEmail(user.email),
});

export const toDetailUser = (user: ReviewUser, now: Date) => ({
  ...toQueueUser(user),
  verificationStatus: user.verificationStatus,
  accountStatus: user.status,
  locked: isLocked(user, now),
  joinedAt: user.createdAt.toISOString(),
});

export const toVerificationSummary = (verification: VerificationSummary) => ({
  id: String(verification._id),
  status: verification.status,
  submittedAt: verification.submittedAt.toISOString(),
  reviewedAt: toIsoString(verification.reviewedAt),
  rejectionReason: verification.rejectionReason ?? null,
});
