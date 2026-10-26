import express from 'express';
import mongoose, { type Model } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestActor } from '../src/types/request-actor.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import type {
  IdentityImageStorage,
  IdentityVerificationEvents,
  StoredIdentityImage,
} from '../src/interfaces/identity-verification.ports.js';
import { IdentityVerificationService } from '../src/features/identity_verifications/identity-verification.service.js';
import { createIdentityVerificationRouter } from '../src/features/identity_verifications/identity-verification.routes.js';
import type { IIdentityVerification } from '../src/models/identity-verification.model.js';
import type { IUser } from '../src/models/user.model.js';

interface FakeUserDoc {
  _id: mongoose.Types.ObjectId;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  phone: string;
  email: string;
  fullName: string;
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
  createdAt: Date;
  updatedAt: Date;
  save: () => Promise<FakeVerificationDoc>;
}

function createInMemoryVerificationModel() {
  const store: FakeVerificationDoc[] = [];

  const VerificationModel = {
    store,
    find: (filter: any) => {
      const matches = store.filter((d) => {
        if (filter.status && d.status !== filter.status) return false;
        return true;
      });
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
    },
    countDocuments: async (filter: any) => {
      return store.filter((d) => !filter.status || d.status === filter.status).length;
    },
    findById: (id: any) => {
      const idStr = id?.toString();
      const doc = store.find((d) => d._id.toString() === idStr);
      return {
        exec: async () => doc ?? null,
        then: (resolve: any) => Promise.resolve(doc ?? null).then(resolve),
      };
    },
    findOneAndUpdate: async (filter: any, update: any) => {
      const idStr = filter._id?.toString();
      const doc = store.find((d) => d._id.toString() === idStr);
      if (!doc) return null;
      if (filter.status && doc.status !== filter.status) return null;

      if (update.status) doc.status = update.status;
      if (update.rejectionReason !== undefined) doc.rejectionReason = update.rejectionReason;
      if (update.reviewedBy) doc.reviewedBy = update.reviewedBy;
      if (update.reviewedAt) doc.reviewedAt = update.reviewedAt;
      doc.updatedAt = new Date();
      return doc;
    },
  } as unknown as Model<IIdentityVerification> & { store: FakeVerificationDoc[] };

  return VerificationModel;
}

function createInMemoryUserModel() {
  const store: FakeUserDoc[] = [];

  const UserModel = {
    store,
    findById: (id: any) => {
      const idStr = id?.toString();
      const doc = store.find((d) => d._id.toString() === idStr);
      return {
        exec: async () => doc ?? null,
        then: (resolve: any) => Promise.resolve(doc ?? null).then(resolve),
      };
    },
    find: (filter: any) => {
      let matches = store;
      if (filter._id?.$in) {
        const ids = filter._id.$in.map((id: any) => id.toString());
        matches = store.filter((u) => ids.includes(u._id.toString()));
      }
      return {
        exec: async () => matches,
        then: (resolve: any) => Promise.resolve(matches).then(resolve),
      };
    },
  } as unknown as Model<IUser> & { store: FakeUserDoc[] };

  return UserModel;
}

describe('Identity Verification Admin API', () => {
  let verificationModel: ReturnType<typeof createInMemoryVerificationModel>;
  let userModel: ReturnType<typeof createInMemoryUserModel>;
  let mockStorage: IdentityImageStorage;
  let mockEvents: IdentityVerificationEvents;
  let service: IdentityVerificationService;
  let app: express.Express;
  let adminActor: RequestActor;
  let userActor: RequestActor;
  let currentActor: RequestActor | undefined;
  let applicantUser: FakeUserDoc;
  let pendingDoc: FakeVerificationDoc;

  beforeEach(() => {
    verificationModel = createInMemoryVerificationModel();
    userModel = createInMemoryUserModel();
    mockStorage = {
      upload: vi.fn(),
      delete: vi.fn(),
      getAuthorizedDelivery: vi.fn(async (publicId: string) => ({
        url: `https://api.cloudinary.com/auth-download/${encodeURIComponent(publicId)}`,
        expiresAt: new Date(Date.now() + 3600000),
      })),
    };
    mockEvents = {
      publishStatusChanged: vi.fn(async () => {}),
    };

    service = new IdentityVerificationService(
      verificationModel as any,
      userModel as any,
      mockStorage,
      mockEvents,
    );

    applicantUser = {
      _id: new mongoose.Types.ObjectId(),
      verificationStatus: 'pending',
      phone: '0912345678',
      email: 'applicant@toyflow.test',
      fullName: 'Nguyen Thi Applicant',
      save: async function () {
        return this;
      },
    };
    userModel.store.push(applicantUser);

    pendingDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId: applicantUser._id,
      phone: '0912345678',
      idCardNumber: '012345678901',
      frontImage: { publicId: 'toyflow/identity/front-1', deliveryType: 'authenticated' },
      backImage: { publicId: 'toyflow/identity/back-1', deliveryType: 'authenticated' },
      selfie: { publicId: 'toyflow/identity/selfie-1', deliveryType: 'authenticated' },
      status: 'pending',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      save: async function () {
        return this;
      },
    };
    verificationModel.store.push(pendingDoc);

    adminActor = {
      userId: new mongoose.Types.ObjectId().toString(),
      actorType: 'ADMIN',
    };
    userActor = {
      userId: applicantUser._id.toString(),
      actorType: 'USER',
    };
    currentActor = adminActor;

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (currentActor) {
        req.auth = currentActor;
      }
      next();
    });
    app.use('/api/v1/identity-verifications', createIdentityVerificationRouter(service));
    app.use(errorHandler);
  });

  describe('Authorization checks', () => {
    it('denies non-Admin USER actor on queue endpoint with 403 FORBIDDEN', async () => {
      currentActor = userActor;
      const res = await request(app).get('/api/v1/identity-verifications');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies non-Admin USER actor on admin detail endpoint with 403 FORBIDDEN', async () => {
      currentActor = userActor;
      const res = await request(app).get(`/api/v1/identity-verifications/${pendingDoc._id}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies non-Admin USER actor on review endpoint with 403 FORBIDDEN', async () => {
      currentActor = userActor;
      const res = await request(app)
        .patch(`/api/v1/identity-verifications/${pendingDoc._id}/review`)
        .send({ action: 'approve' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/identity-verifications (Admin Queue)', () => {
    it('returns paginated pending list with user summaries', async () => {
      const res = await request(app).get('/api/v1/identity-verifications?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toEqual({
        id: pendingDoc._id.toString(),
        userId: applicantUser._id.toString(),
        fullName: 'Nguyen Thi Applicant',
        email: 'applicant@toyflow.test',
        phone: '0912345678',
        idCardNumber: '012345678901',
        status: 'pending',
        submittedAt: expect.any(String),
      });
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.page).toBe(1);
    });
  });

  describe('GET /api/v1/identity-verifications/:id (Admin Detail)', () => {
    it('returns detail with authorized signed image URLs', async () => {
      const res = await request(app).get(`/api/v1/identity-verifications/${pendingDoc._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(pendingDoc._id.toString());
      expect(res.body.data.user.fullName).toBe('Nguyen Thi Applicant');
      expect(res.body.data.frontImage.url).toContain('toyflow%2Fidentity%2Ffront-1');
      expect(res.body.data.backImage.url).toContain('toyflow%2Fidentity%2Fback-1');
      expect(res.body.data.selfie.url).toContain('toyflow%2Fidentity%2Fselfie-1');
      expect(mockStorage.getAuthorizedDelivery).toHaveBeenCalledTimes(3);
    });

    it('returns 404 when verification does not exist', async () => {
      const randomId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/v1/identity-verifications/${randomId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/identity-verifications/:id/review', () => {
    it('approves pending dossier, updates user to verified, and publishes event', async () => {
      const res = await request(app)
        .patch(`/api/v1/identity-verifications/${pendingDoc._id}/review`)
        .send({ action: 'approve' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('verified');
      expect(pendingDoc.status).toBe('verified');
      expect(applicantUser.verificationStatus).toBe('verified');
      expect(applicantUser.idCardNumber).toBe('012345678901');
      expect(mockEvents.publishStatusChanged).toHaveBeenCalledWith(
        applicantUser._id.toString(),
        'verified',
        undefined,
      );
    });

    it('rejects pending dossier with reason, updates user to rejected, and publishes event', async () => {
      const res = await request(app)
        .patch(`/api/v1/identity-verifications/${pendingDoc._id}/review`)
        .send({ action: 'reject', rejectionReason: 'Ảnh chân dung không rõ nét' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('rejected');
      expect(pendingDoc.status).toBe('rejected');
      expect(pendingDoc.rejectionReason).toBe('Ảnh chân dung không rõ nét');
      expect(applicantUser.verificationStatus).toBe('rejected');
      expect(mockEvents.publishStatusChanged).toHaveBeenCalledWith(
        applicantUser._id.toString(),
        'rejected',
        'Ảnh chân dung không rõ nét',
      );
    });

    it('fails rejection with 400 when rejectionReason is missing or empty', async () => {
      const res = await request(app)
        .patch(`/api/v1/identity-verifications/${pendingDoc._id}/review`)
        .send({ action: 'reject' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('fails with 409 conflict when dossier is not in pending status', async () => {
      pendingDoc.status = 'verified';

      const res = await request(app)
        .patch(`/api/v1/identity-verifications/${pendingDoc._id}/review`)
        .send({ action: 'reject', rejectionReason: 'Test reason' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SUBMISSION_NOT_PENDING');
    });
  });
});
