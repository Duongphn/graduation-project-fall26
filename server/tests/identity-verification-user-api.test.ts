import express from 'express';
import mongoose, { type Model } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { RequestActor } from '../src/shared/contracts/request-actor.js';
import { errorHandler } from '../src/shared/middleware/error-handler.js';
import type {
  IdentityImageStorage,
  StoredIdentityImage,
} from '../src/features/identity_verifications/identity-verification.ports.js';
import { IdentityVerificationService } from '../src/features/identity_verifications/identity-verification.service.js';
import { createIdentityVerificationRouter } from '../src/features/identity_verifications/identity-verification.routes.js';
import type { IIdentityVerification } from '../src/features/identity_verifications/identity_verifications.model.js';
import type { IUser } from '../src/features/users/users.model.js';

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

function createMockStorage(): IdentityImageStorage & {
  uploads: string[];
  deleted: StoredIdentityImage[];
} {
  const uploads: string[] = [];
  const deleted: StoredIdentityImage[] = [];
  let counter = 0;

  return {
    uploads,
    deleted,
    upload: async (_buffer, _mimeType) => {
      counter += 1;
      const publicId = `toyflow/identity/doc-${counter}`;
      uploads.push(publicId);
      return {
        publicId,
        deliveryType: 'authenticated',
      };
    },
    delete: async (images) => {
      deleted.push(...images);
    },
    getAuthorizedDelivery: async (publicId) => {
      return {
        url: `https://api.cloudinary.com/download?publicId=${publicId}&sig=mock`,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };
    },
  };
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

  const VerificationModel = function (this: FakeVerificationDoc, data: Record<string, unknown>): void {
    Object.assign(this, data);
    this._id = new mongoose.Types.ObjectId();
    this.submittedAt = (data.submittedAt as Date) || new Date();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.save = async (): Promise<FakeVerificationDoc> => {
      // Check partial unique index constraint for status: 'pending'
      if (this.status === 'pending') {
        const existing = store.find(
          (d) => d.userId.equals(this.userId) && d.status === 'pending' && !d._id.equals(this._id),
        );
        if (existing) {
          const err: any = new Error('E11000 duplicate key error collection: one_pending_per_user');
          err.code = 11000;
          throw err;
        }
      }
      this.updatedAt = new Date();
      const index = store.findIndex((doc) => doc._id.equals(this._id));
      if (index >= 0) {
        store[index] = this;
      } else {
        store.push(this);
      }
      return this;
    };
  } as unknown as Model<IIdentityVerification> & { store: FakeVerificationDoc[] };

  VerificationModel.findOne = ((filter: any) => {
    let matches = store.filter((d) => {
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
    } as any;
  }) as any;

  (VerificationModel as any).store = store;
  return VerificationModel;
}

interface FakeUserDoc {
  _id: mongoose.Types.ObjectId;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  phone: string;
  email: string;
  fullName: string;
  save: () => Promise<FakeUserDoc>;
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
      } as any;
    },
  } as unknown as Model<IUser> & { store: FakeUserDoc[] };

  return UserModel;
}

describe('Identity Verification User API', () => {
  let verificationModel: ReturnType<typeof createInMemoryVerificationModel>;
  let userModel: ReturnType<typeof createInMemoryUserModel>;
  let storage: ReturnType<typeof createMockStorage>;
  let service: IdentityVerificationService;
  let app: express.Express;
  let currentUser: FakeUserDoc;
  let currentActor: RequestActor | undefined;

  beforeEach(() => {
    verificationModel = createInMemoryVerificationModel();
    userModel = createInMemoryUserModel();
    storage = createMockStorage();
    service = new IdentityVerificationService(
      verificationModel as any,
      userModel as any,
      storage,
    );

    currentUser = {
      _id: new mongoose.Types.ObjectId(),
      verificationStatus: 'unverified',
      phone: '0912345678',
      email: 'user@toyflow.test',
      fullName: 'Tran Van User',
      save: async function () {
        return this;
      },
    };
    userModel.store.push(currentUser);

    currentActor = {
      userId: currentUser._id.toString(),
      actorType: 'USER',
    };

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

  describe('POST /api/v1/identity-verifications', () => {
    it('successfully submits verification dossier with valid inputs and images', async () => {
      const res = await request(app)
        .post('/api/v1/identity-verifications')
        .field('phone', '0912345678')
        .field('idCardNumber', '012345678901')
        .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
        .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
        .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.id).toBeDefined();
      expect(currentUser.verificationStatus).toBe('pending');
      expect(storage.uploads).toHaveLength(3);
    });

    it('rejects invalid VN phone number with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/identity-verifications')
        .field('phone', '12345') // invalid phone
        .field('idCardNumber', '012345678901')
        .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
        .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
        .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid ID card number (not 9 or 12 digits) with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/identity-verifications')
        .field('phone', '0912345678')
        .field('idCardNumber', '1234567890') // 10 digits
        .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
        .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
        .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects verified user with 409 ALREADY_VERIFIED', async () => {
      currentUser.verificationStatus = 'verified';

      const res = await request(app)
        .post('/api/v1/identity-verifications')
        .field('phone', '0912345678')
        .field('idCardNumber', '012345678901')
        .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
        .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
        .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_VERIFIED');
    });

    it('rejects duplicate pending submission with 409 VERIFICATION_ALREADY_PENDING', async () => {
      currentUser.verificationStatus = 'pending';
      verificationModel.store.push({
        _id: new mongoose.Types.ObjectId(),
        userId: currentUser._id,
        phone: '0912345678',
        idCardNumber: '012345678901',
        frontImage: { publicId: 'p1', deliveryType: 'authenticated' },
        backImage: { publicId: 'p2', deliveryType: 'authenticated' },
        selfie: { publicId: 'p3', deliveryType: 'authenticated' },
        status: 'pending',
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () {
          return this;
        },
      });

      const res = await request(app)
        .post('/api/v1/identity-verifications')
        .field('phone', '0912345678')
        .field('idCardNumber', '012345678901')
        .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
        .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
        .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VERIFICATION_ALREADY_PENDING');
    });

    it('permits resubmission if previous submission was rejected and retains history', async () => {
      currentUser.verificationStatus = 'rejected';
      const oldDoc: FakeVerificationDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: currentUser._id,
        phone: '0912345678',
        idCardNumber: '012345678901',
        frontImage: { publicId: 'old1', deliveryType: 'authenticated' },
        backImage: { publicId: 'old2', deliveryType: 'authenticated' },
        selfie: { publicId: 'old3', deliveryType: 'authenticated' },
        status: 'rejected',
        rejectionReason: 'Blurry selfie',
        submittedAt: new Date(Date.now() - 86400000),
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(Date.now() - 86400000),
        save: async function () {
          return this;
        },
      };
      verificationModel.store.push(oldDoc);

      const res = await request(app)
        .post('/api/v1/identity-verifications')
        .field('phone', '0912345678')
        .field('idCardNumber', '012345678901')
        .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
        .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
        .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      expect(verificationModel.store).toHaveLength(2); // History retained
      expect(currentUser.verificationStatus).toBe('pending');
    });
  });

  describe('GET /api/v1/identity-verifications/my-latest', () => {
    it('returns null data when user has no verification submissions', async () => {
      const res = await request(app).get('/api/v1/identity-verifications/my-latest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('returns latest verification details and rejection reason without leaking image paths', async () => {
      const past = new Date(Date.now() - 3600000);
      verificationModel.store.push({
        _id: new mongoose.Types.ObjectId(),
        userId: currentUser._id,
        phone: '0912345678',
        idCardNumber: '012345678901',
        frontImage: { publicId: 'secret1', deliveryType: 'authenticated' },
        backImage: { publicId: 'secret2', deliveryType: 'authenticated' },
        selfie: { publicId: 'secret3', deliveryType: 'authenticated' },
        status: 'rejected',
        rejectionReason: 'Card is expired',
        submittedAt: past,
        createdAt: past,
        updatedAt: past,
        save: async function () {
          return this;
        },
      });

      const res = await request(app).get('/api/v1/identity-verifications/my-latest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        status: 'rejected',
        submittedAt: past.toISOString(),
        rejectionReason: 'Card is expired',
        reviewedAt: null,
      });
      expect(res.body.data.frontImage).toBeUndefined();
      expect(res.body.data.publicId).toBeUndefined();
    });
  });
});
