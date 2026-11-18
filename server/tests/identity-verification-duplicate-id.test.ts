import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { IdentityVerification } from '../src/models/identity-verification.model.js';
import { User } from '../src/models/user.model.js';
import { IdentityVerificationService } from '../src/services/identity-verification.service.js';
import { useTestDatabase } from './support/test-database.js';

// GB-01: approving an ID number that is already verified on another account is refused with
// 409, and the request and the user both stay pending (R5.2 ITC_MOD_15).
useTestDatabase();

const image = () => ({
  publicId: `id/${new mongoose.Types.ObjectId().toString()}`,
  deliveryType: 'authenticated' as const,
});
const user = (email: string, phone: string, extra: Record<string, unknown> = {}) =>
  User.create({ email, phone, fullName: 'Người Dùng', passwordHash: 'x', ...extra });

describe('IdentityVerificationService.review with an ID number already verified elsewhere', () => {
  it('answers 409 without the number and leaves the request and the user pending', async () => {
    await user('x@toyflow.test', '0911000001', {
      verificationStatus: 'verified',
      idCardNumber: '079201009999',
    });
    const y = await user('y@toyflow.test', '0911000002', { verificationStatus: 'pending' });
    const request = await IdentityVerification.create({
      userId: y._id,
      phone: y.phone,
      idCardNumber: '079201009999',
      frontImage: image(),
      backImage: image(),
      selfie: image(),
      status: 'pending',
    });
    const service = new IdentityVerificationService();

    const error = await service
      .review(new mongoose.Types.ObjectId().toString(), String(request._id), { action: 'approve' })
      .catch((e: unknown) => e as { statusCode?: number; code?: string; message?: string });

    expect(error).toMatchObject({ statusCode: 409, code: 'ID_CARD_ALREADY_VERIFIED' });
    expect((error as { message?: string }).message).not.toContain('079201009999');
    const stored = await IdentityVerification.findById(request._id).lean();
    expect(stored?.status).toBe('pending');
    expect(stored?.reviewedBy).toBeUndefined();
    expect((await User.findById(y._id).lean())?.verificationStatus).toBe('pending');
  });
});
