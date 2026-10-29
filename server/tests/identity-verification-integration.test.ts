import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import type {
  IdentityImageStorage,
  IdentityVerificationEvents,
  StoredIdentityImage,
  VerificationStatus,
} from '../src/interfaces/identity-verification.ports.js';
import type { UserAvatarStorage } from '../src/interfaces/user.ports.js';
import { UsersService } from '../src/services/user.service.js';
import { IdentityVerificationService } from '../src/services/identity-verification.service.js';

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

function createTestToken(userId: string, role: 'USER' | 'ADMIN'): string {
  return jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '1h' });
}

interface FakeUserDoc {
  _id: mongoose.Types.ObjectId;
  phone: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatar?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  address?: {
    province: string;
    district: string;
    ward: string;
    street: string;
  };
  idCardNumber?: string;
  save: () => Promise<FakeUserDoc>;
}

interface FakeVerificationDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  phone: string;
  idCardNumber: string;
  frontImage: StoredIdentityImage;
  backImage: StoredIdentityImage;
  selfie: StoredIdentityImage;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  submittedAt: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  save: () => Promise<FakeVerificationDoc>;
}

describe('UC03 End-to-End Integration Lifecycle', () => {
  let userStore: FakeUserDoc[];
  let verificationStore: FakeVerificationDoc[];
  let mockUserModel: any;
  let mockVerificationModel: any;
  let app: express.Express;
  let regularUserId: string;
  let adminUserId: string;
  let userToken: string;
  let adminToken: string;
  let publishedEvents: { userId: string; status: VerificationStatus; rejectionReason?: string | undefined }[];

  beforeEach(() => {
    userStore = [];
    verificationStore = [];
    publishedEvents = [];

    regularUserId = new mongoose.Types.ObjectId().toString();
    adminUserId = new mongoose.Types.ObjectId().toString();
    userToken = createTestToken(regularUserId, 'USER');
    adminToken = createTestToken(adminUserId, 'ADMIN');

    const regularUser: FakeUserDoc = {
      _id: new mongoose.Types.ObjectId(regularUserId),
      phone: '0901234567',
      email: 'member@toyflow.test',
      passwordHash: 'secret_hash_not_visible',
      fullName: 'Le Van Member',
      role: 'USER',
      status: 'ACTIVE',
      verificationStatus: 'unverified',
      save: async function () {
        return this;
      },
    };
    userStore.push(regularUser);

    mockUserModel = {
      findById: (id: any) => {
        const idStr = id?.toString();
        const doc = userStore.find((u) => u._id.toString() === idStr);
        return {
          exec: async () => doc ?? null,
          then: (resolve: any) => Promise.resolve(doc ?? null).then(resolve),
        };
      },
      find: (filter: any) => {
        let matches = userStore;
        if (filter._id?.$in) {
          const ids = filter._id.$in.map((id: any) => id.toString());
          matches = userStore.filter((u) => ids.includes(u._id.toString()));
        }
        return {
          exec: async () => matches,
          then: (resolve: any) => Promise.resolve(matches).then(resolve),
        };
      },
    };

    mockVerificationModel = function (this: FakeVerificationDoc, data: Record<string, unknown>): void {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.submittedAt = (data.submittedAt as Date) || new Date();
      this.save = async (): Promise<FakeVerificationDoc> => {
        const index = verificationStore.findIndex((doc) => doc._id.equals(this._id));
        if (index >= 0) {
          verificationStore[index] = this;
        } else {
          verificationStore.push(this);
        }
        return this;
      };
    };

    mockVerificationModel.find = (filter: any) => {
      const matches = verificationStore.filter((d) => !filter.status || d.status === filter.status);
      return {
        sort: () => ({
          skip: (offset: number) => ({
            limit: (count: number) => ({
              exec: async () => matches.slice(offset, offset + count),
              then: (resolve: any) =>
                Promise.resolve(matches.slice(offset, offset + count)).then(resolve),
            }),
          }),
        }),
      };
    };

    mockVerificationModel.countDocuments = async (filter: any) => {
      return verificationStore.filter((d) => !filter.status || d.status === filter.status).length;
    };

    mockVerificationModel.findById = (id: any) => {
      const idStr = id?.toString();
      const doc = verificationStore.find((d) => d._id.toString() === idStr);
      return {
        exec: async () => doc ?? null,
        then: (resolve: any) => Promise.resolve(doc ?? null).then(resolve),
      };
    };

    mockVerificationModel.findOne = (filter: any) => {
      let matches = verificationStore.filter((d) => {
        if (filter.userId && !d.userId.equals(filter.userId)) return false;
        if (filter.status && d.status !== filter.status) return false;
        return true;
      });
      return {
        sort: (sortObj: any) => {
          if (sortObj?.submittedAt === -1) {
            matches = matches.slice().sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
          }
          return {
            exec: async () => matches[0] ?? null,
            then: (resolve: any) => Promise.resolve(matches[0] ?? null).then(resolve),
          };
        },
        exec: async () => matches[0] ?? null,
        then: (resolve: any) => Promise.resolve(matches[0] ?? null).then(resolve),
      };
    };

    mockVerificationModel.findOneAndUpdate = async (filter: any, update: any) => {
      const idStr = filter._id?.toString();
      const doc = verificationStore.find((d) => d._id.toString() === idStr);
      if (!doc || (filter.status && doc.status !== filter.status)) return null;

      if (update.status) doc.status = update.status;
      if (update.rejectionReason !== undefined) doc.rejectionReason = update.rejectionReason;
      if (update.reviewedBy) doc.reviewedBy = update.reviewedBy;
      if (update.reviewedAt) doc.reviewedAt = update.reviewedAt;
      return doc;
    };

    const mockAvatarStorage: UserAvatarStorage = {
      upload: async () => ({
        url: 'https://res.cloudinary.com/toyflow/image/upload/avatar.jpg',
        publicId: 'toyflow/avatars/avatar',
      }),
    };

    const mockIdentityStorage: IdentityImageStorage = {
      upload: async (_buffer, _mime) => ({
        publicId: `toyflow/identity/doc-${Date.now()}`,
        deliveryType: 'authenticated',
      }),
      delete: async () => {},
      getAuthorizedDelivery: async (publicId) => ({
        url: `https://api.cloudinary.com/download?publicId=${encodeURIComponent(publicId)}`,
        expiresAt: new Date(Date.now() + 3600000),
      }),
    };

    const mockEvents: IdentityVerificationEvents = {
      publishStatusChanged: async (userId, status, rejectionReason) => {
        publishedEvents.push({ userId, status, rejectionReason });
      },
    };

    const usersService = new UsersService(mockUserModel, mockAvatarStorage);
    const identityVerificationService = new IdentityVerificationService(
      mockVerificationModel as any,
      mockUserModel,
      mockIdentityStorage,
      mockEvents,
    );

    app = createApp({
      usersService,
      identityVerificationService,
      avatarStorage: mockAvatarStorage,
      identityImageStorage: mockIdentityStorage,
      identityVerificationEvents: mockEvents,
    });
  });

  it('runs complete lifecycle: unverified -> pending -> rejected -> pending -> verified', async () => {
    // 1. Initial profile check (unverified)
    const initialProfile = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${userToken}`);

    expect(initialProfile.status).toBe(200);
    expect(initialProfile.body.data.verificationStatus).toBe('unverified');
    expect(initialProfile.body.data.passwordHash).toBeUndefined();

    // 2. Submit dossier -> transitions to pending
    const submitRes = await request(app)
      .post('/api/v1/identity-verifications')
      .set('Authorization', `Bearer ${userToken}`)
      .field('phone', '0901234567')
      .field('idCardNumber', '012345678901')
      .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.status).toBe('pending');
    const firstSubmissionId = submitRes.body.data.id;

    // Verify user profile is now pending
    const pendingProfile = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${userToken}`);
    expect(pendingProfile.body.data.verificationStatus).toBe('pending');

    // 3. Admin lists queue and inspects detail
    const queueRes = await request(app)
      .get('/api/v1/identity-verifications?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.items.some((i: any) => i.id === firstSubmissionId)).toBe(true);

    const detailRes = await request(app)
      .get(`/api/v1/identity-verifications/${firstSubmissionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.frontImage.url).toContain('https://api.cloudinary.com');

    // 4. Admin rejects with reason
    const rejectRes = await request(app)
      .patch(`/api/v1/identity-verifications/${firstSubmissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reject', rejectionReason: 'Ảnh mờ không rõ nét' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
    expect(publishedEvents).toContainEqual({
      userId: regularUserId,
      status: 'rejected',
      rejectionReason: 'Ảnh mờ không rõ nét',
    });

    // Verify latest status for user
    const latestAfterReject = await request(app)
      .get('/api/v1/identity-verifications/my-latest')
      .set('Authorization', `Bearer ${userToken}`);
    expect(latestAfterReject.status).toBe(200);
    expect(latestAfterReject.body.data.status).toBe('rejected');
    expect(latestAfterReject.body.data.rejectionReason).toBe('Ảnh mờ không rõ nét');

    // 5. User resubmits -> transitions to pending again
    const resubmitRes = await request(app)
      .post('/api/v1/identity-verifications')
      .set('Authorization', `Bearer ${userToken}`)
      .field('phone', '0901234567')
      .field('idCardNumber', '012345678901')
      .attach('frontImage', VALID_JPEG, { filename: 'front2.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back2.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie2.jpg', contentType: 'image/jpeg' });

    expect(resubmitRes.status).toBe(201);
    const secondSubmissionId = resubmitRes.body.data.id;
    expect(secondSubmissionId).not.toBe(firstSubmissionId);
    expect(verificationStore).toHaveLength(2); // History retained

    // 6. Admin approves second submission
    const approveRes = await request(app)
      .patch(`/api/v1/identity-verifications/${secondSubmissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('verified');
    expect(publishedEvents).toContainEqual({
      userId: regularUserId,
      status: 'verified',
      rejectionReason: undefined,
    });

    // 7. Verify user is now verified
    const verifiedProfile = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${userToken}`);
    expect(verifiedProfile.body.data.verificationStatus).toBe('verified');

    // 8. Verified user cannot resubmit
    const tryResubmitVerified = await request(app)
      .post('/api/v1/identity-verifications')
      .set('Authorization', `Bearer ${userToken}`)
      .field('phone', '0901234567')
      .field('idCardNumber', '012345678901')
      .attach('frontImage', VALID_JPEG, { filename: 'f.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 's.jpg', contentType: 'image/jpeg' });
    expect(tryResubmitVerified.status).toBe(409);
    expect(tryResubmitVerified.body.error.code).toBe('ALREADY_VERIFIED');
  });

  it('enforces route authentication and role boundaries', async () => {
    // Unauthenticated
    const unauth = await request(app).get('/api/v1/users/profile');
    expect(unauth.status).toBe(401);

    // Regular USER cannot access Admin queue
    const userOnAdminQueue = await request(app)
      .get('/api/v1/identity-verifications')
      .set('Authorization', `Bearer ${userToken}`);
    expect(userOnAdminQueue.status).toBe(403);
  });
});
