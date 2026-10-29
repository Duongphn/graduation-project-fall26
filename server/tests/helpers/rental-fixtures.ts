import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import {
  type Clock,
  type RentalNotification,
  type RentalNotifier,
  type RentalPhotoStorage,
} from '../../src/interfaces/rental-order.ports.js';
import { Category, Toy, User } from '../../src/models/index.js';
import { withTransaction } from '../../src/repositories/transaction.js';
import { WalletLedgerRepository } from '../../src/repositories/wallet-ledger.repository.js';

let userCounter = 0;

export async function createUser(overrides: Record<string, unknown> = {}) {
  userCounter += 1;
  return User.create({
    phone: `090${String(userCounter).padStart(7, '0')}`,
    email: `user${userCounter}@example.com`,
    passwordHash: 'hash',
    fullName: `User ${userCounter}`,
    role: 'USER',
    status: 'ACTIVE',
    verificationStatus: 'verified',
    trust: { score: 80 },
    ...overrides,
  });
}

export async function createRentToy(
  ownerId: string | mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  let category = await Category.findOne();
  if (!category) {
    category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      status: 'active',
      displayOrder: 1,
    });
  }

  return Toy.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    categoryId: category._id,
    title: 'Test Lego Toy',
    description: 'Detailed description for test toy',
    condition: 'like_new',
    listingType: 'rent',
    priceOrRate: 50_000,
    depositPrice: 200_000,
    status: 'active',
    ageRange: { minAge: 3, maxAge: 8 },
    images: [{ url: 'https://cloudinary.com/test.jpg', publicId: 'test-img-1' }],
    quantity: 1,
    bookingVersion: 0,
    ...overrides,
  });
}

export function authHeader(userId: string, role: 'USER' | 'ADMIN' = 'USER') {
  return {
    Authorization: `Bearer ${jwt.sign({ userId, role }, env.jwtAccessSecret)}`,
  };
}

export class FakeClock implements Clock {
  private currentTime: Date;

  public constructor(isoOrDate: string | Date = '2026-11-01T03:00:00Z') {
    this.currentTime = new Date(isoOrDate);
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public set(isoOrDate: string | Date): void {
    this.currentTime = new Date(isoOrDate);
  }

  public advanceHours(hours: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + hours * 3_600_000);
  }
}

export function fakePhotoStorage(): {
  storage: RentalPhotoStorage;
  uploaded: string[];
  deleted: string[];
} {
  const uploaded: string[] = [];
  const deleted: string[] = [];
  let counter = 0;

  const storage: RentalPhotoStorage = {
    async upload() {
      counter += 1;
      const publicId = `fake-photo-${counter}`;
      uploaded.push(publicId);
      return {
        url: `https://fake.storage/${publicId}.jpg`,
        publicId,
      };
    },
    async delete(publicIds: string[]) {
      deleted.push(...publicIds);
    },
  };

  return { storage, uploaded, deleted };
}

export function fakeNotifier(): {
  notifier: RentalNotifier;
  sent: RentalNotification[];
} {
  const sent: RentalNotification[] = [];

  const notifier: RentalNotifier = {
    async notify(n: RentalNotification) {
      sent.push(n);
    },
  };

  return { notifier, sent };
}

export async function fund(userId: string, amount: number): Promise<void> {
  const ledger = new WalletLedgerRepository();
  await withTransaction(async (session) => {
    const userWallet = await ledger.getOrCreateUserWallet(userId, session);
    const externalWallet = await ledger.getOrCreateSystemWallet('external', session);

    await ledger.post(
      `fund:${Date.now()}:${Math.random()}`,
      { kind: 'admin_credit', id: new mongoose.Types.ObjectId().toString() },
      [
        { walletId: externalWallet.id, amount: -amount },
        { walletId: userWallet.id, amount },
      ],
      session,
      'Test funding',
    );
  });
}

export interface BuiltRentalApp {
  app: express.Express;
  clock: FakeClock;
  photoStorage: ReturnType<typeof fakePhotoStorage>;
  notifier: ReturnType<typeof fakeNotifier>;
  ledger: WalletLedgerRepository;
}

export function buildRentalApp(
  clock: FakeClock = new FakeClock('2026-11-01T03:00:00Z'),
): BuiltRentalApp {
  const photos = fakePhotoStorage();
  const notif = fakeNotifier();
  const ledger = new WalletLedgerRepository();

  const app = createApp({
    clock,
    rentalPhotoStorage: photos.storage,
    rentalNotifier: notif.notifier,
    walletLedger: ledger,
  } as unknown as Record<string, unknown>);

  return {
    app,
    clock,
    photoStorage: photos,
    notifier: notif,
    ledger,
  };
}
