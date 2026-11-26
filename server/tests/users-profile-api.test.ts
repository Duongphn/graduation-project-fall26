import express from 'express';
import mongoose, { type Model } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { RequestActor } from '../src/types/request-actor.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { createUsersRouter } from '../src/routes/user.routes.js';
import { UsersService } from '../src/services/user.service.js';
import type { UserAvatarStorage } from '../src/interfaces/user.ports.js';
import type { IUser } from '../src/models/user.model.js';

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const SVG_CONTENT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');

interface FakeUserDoc {
  _id: mongoose.Types.ObjectId;
  phone: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatar?: string;
  avatarPublicId?: string;
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
  createdAt: Date;
  updatedAt: Date;
  save: () => Promise<FakeUserDoc>;
}

function createInMemoryUserModel() {
  const store: FakeUserDoc[] = [];

  const UserModel = function (this: FakeUserDoc, data: Record<string, unknown>): void {
    Object.assign(this, data);
    this._id = new mongoose.Types.ObjectId();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.save = async (): Promise<FakeUserDoc> => {
      this.updatedAt = new Date();
      const index = store.findIndex((doc) => doc._id.equals(this._id));
      if (index >= 0) {
        store[index] = this;
      } else {
        store.push(this);
      }
      return this;
    };
  } as unknown as Model<IUser> & { store: FakeUserDoc[] };

  UserModel.findById = ((id: any) => {
    const idStr = id?.toString();
    const doc = store.find((d) => d._id.toString() === idStr);
    return {
      exec: async () => doc ?? null,
      then: (resolve: any) => Promise.resolve(doc ?? null).then(resolve),
    } as any;
  }) as any;

  (UserModel as any).store = store;
  return UserModel;
}

function createMockAvatarStorage(): UserAvatarStorage & { uploads: string[] } {
  const uploads: string[] = [];
  return {
    uploads,
    upload: async (_buffer, mimeType) => {
      uploads.push(mimeType);
      return {
        url: `https://res.cloudinary.com/toyflow/image/upload/avatar-${uploads.length}.jpg`,
        publicId: `toyflow/avatars/avatar-${uploads.length}`,
      };
    },
  };
}

describe('User Profile and Avatar APIs', () => {
  let userModel: ReturnType<typeof createInMemoryUserModel>;
  let avatarStorage: ReturnType<typeof createMockAvatarStorage>;
  let service: UsersService;
  let app: express.Express;
  let currentUser: FakeUserDoc;
  let currentActor: RequestActor | undefined;

  beforeEach(() => {
    userModel = createInMemoryUserModel();
    avatarStorage = createMockAvatarStorage();
    service = new UsersService(userModel as any, avatarStorage);

    currentUser = {
      _id: new mongoose.Types.ObjectId(),
      phone: '0912345678',
      email: 'user@toyflow.test',
      passwordHash: 'secret_hash_not_for_public',
      fullName: 'Nguyen Van A',
      role: 'USER',
      status: 'ACTIVE',
      verificationStatus: 'unverified',
      createdAt: new Date(),
      updatedAt: new Date(),
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
    app.use('/api/v1/users', createUsersRouter(service));
    app.use(errorHandler);
  });

  describe('GET /api/v1/users/profile', () => {
    it('returns 401 when actor is not authenticated', async () => {
      currentActor = undefined;
      const res = await request(app).get('/api/v1/users/profile');
      expect(res.status).toBe(401);
    });

    it('returns public profile allowlist omitting passwordHash and sensitive fields', async () => {
      currentUser.idCardNumber = '123456789012';
      const res = await request(app).get('/api/v1/users/profile');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        id: currentUser._id.toString(),
        fullName: 'Nguyen Van A',
        email: 'user@toyflow.test',
        phone: '0912345678',
        avatarUrl: undefined,
        dateOfBirth: null,
        gender: null,
        bio: null,
        trustScore: 100,
        memberSince: currentUser.createdAt.toISOString(),
        verificationStatus: 'unverified',
        role: 'USER',
      });
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.idCardNumber).toBeUndefined();
    });
  });

  describe('PATCH /api/v1/users/profile', () => {
    it('updates date of birth, gender and bio, and clears them with null (R03 III.6.1.1 (5)–(7))', async () => {
      const res = await request(app)
        .patch('/api/v1/users/profile')
        .send({ dateOfBirth: '1990-05-17', gender: 'female', bio: '  Mẹ của hai bé, thích đồ chơi gỗ.  ' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        dateOfBirth: '1990-05-17',
        gender: 'female',
        bio: 'Mẹ của hai bé, thích đồ chơi gỗ.',
      });

      const cleared = await request(app)
        .patch('/api/v1/users/profile')
        .send({ dateOfBirth: null, gender: null, bio: '' });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data).toMatchObject({ dateOfBirth: null, gender: null, bio: null });
    });

    it('shows the stored Trust Score read-only and refuses to change it or the member-since date', async () => {
      (currentUser as FakeUserDoc & { trust?: { score: number } }).trust = { score: 72 };
      const res = await request(app).get('/api/v1/users/profile');
      expect(res.body.data.trustScore).toBe(72);

      for (const patch of [{ trustScore: 100 }, { memberSince: '2020-01-01' }, { address: { province: 'Ha Noi', ward: 'Cau Giay', street: '1 Xuan Thuy' } }]) {
        const refused = await request(app).patch('/api/v1/users/profile').send(patch);
        expect(refused.status).toBe(400);
        expect(refused.body.error.code).toBe('INVALID_INPUT');
      }
    });

    it('rejects an impossible or future date of birth, an unknown gender and a bio over 200 characters', async () => {
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      for (const patch of [
        { dateOfBirth: '1990-02-30' },
        { dateOfBirth: '17/05/1990' },
        { dateOfBirth: tomorrow },
        { gender: 'unknown' },
        { bio: 'a'.repeat(201) },
      ]) {
        const res = await request(app).patch('/api/v1/users/profile').send(patch);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      }
      const ok = await request(app).patch('/api/v1/users/profile').send({ bio: 'a'.repeat(200), gender: 'other' });
      expect(ok.status).toBe(200);
    });

    it('rejects a full name with digits, under 2 or over 50 characters (R03 III.6.1.1 (5))', async () => {
      for (const fullName of ['A', 'Nguyen Van 123', 'A'.repeat(51)]) {
        const res = await request(app).patch('/api/v1/users/profile').send({ fullName });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_INPUT');
      }
      const ok = await request(app).patch('/api/v1/users/profile').send({ fullName: 'Nguyễn Thị Ánh' });
      expect(ok.status).toBe(200);
    });

    it('rejects unknown or forbidden fields outside allowlist', async () => {
      const res = await request(app)
        .patch('/api/v1/users/profile')
        .send({
          fullName: 'Nguyen Van C',
          role: 'ADMIN',
          verificationStatus: 'verified',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('prevents modifying legal identity fields if account is already verified', async () => {
      currentUser.verificationStatus = 'verified';

      const res = await request(app)
        .patch('/api/v1/users/profile')
        .send({
          phone: '0987654321',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('POST /api/v1/users/avatar', () => {
    it('uploads valid JPEG avatar and updates user profile', async () => {
      const res = await request(app)
        .post('/api/v1/users/avatar')
        .attach('avatar', VALID_JPEG, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatarUrl).toContain('toyflow/image/upload/avatar-1.jpg');
      expect(currentUser.avatar).toContain('avatar-1.jpg');
    });

    it('rejects SVG avatar with INVALID_IMAGE_TYPE', async () => {
      const res = await request(app)
        .post('/api/v1/users/avatar')
        .attach('avatar', SVG_CONTENT, { filename: 'avatar.svg', contentType: 'image/svg+xml' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IMAGE_TYPE');
    });

    it('rejects missing avatar file with MISSING_REQUIRED_IMAGE', async () => {
      const res = await request(app)
        .post('/api/v1/users/avatar')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_REQUIRED_IMAGE');
    });
  });
});
