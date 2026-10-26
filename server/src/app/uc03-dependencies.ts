import { Router } from 'express';
import { env } from '../config/env.js';
import { User } from '../features/users/users.model.js';
import { IdentityVerification } from '../features/identity_verifications/identity_verifications.model.js';
import { UsersService } from '../features/users/users.service.js';
import { createUsersRouter } from '../features/users/users.routes.js';
import type { UserAvatarStorage } from '../interfaces/user.ports.js';
import { IdentityVerificationService } from '../features/identity_verifications/identity-verification.service.js';
import { createIdentityVerificationRouter } from '../features/identity_verifications/identity-verification.routes.js';
import type {
  IdentityImageStorage,
  IdentityVerificationEvents,
} from '../interfaces/identity-verification.ports.js';
import { configureCloudinary } from '../integrations/cloudinary/cloudinary-client.js';
import { CloudinaryImageStorage } from '../integrations/cloudinary/cloudinary-image-storage.js';
import { CloudinaryIdentityStorage } from '../integrations/cloudinary/cloudinary-identity-storage.js';
import { DefaultIdentityVerificationEvents } from '../integrations/events/identity-verification-events.js';

export interface UC03Dependencies {
  usersService: UsersService;
  usersRouter: Router;
  identityVerificationService: IdentityVerificationService;
  identityVerificationRouter: Router;
  avatarStorage: UserAvatarStorage;
  identityStorage: IdentityImageStorage;
  events: IdentityVerificationEvents;
}

export interface CreateUC03DependenciesOptions {
  avatarStorage?: UserAvatarStorage;
  identityStorage?: IdentityImageStorage;
  events?: IdentityVerificationEvents;
  usersService?: UsersService;
  identityVerificationService?: IdentityVerificationService;
}

function createDefaultAvatarStorage(): UserAvatarStorage {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      async upload() {
        return {
          url: 'https://res.cloudinary.com/toyflow/image/upload/mock-avatar.jpg',
          publicId: 'toyflow/avatars/mock-avatar',
        };
      },
    };
  }

  const client = configureCloudinary({ cloudName, apiKey, apiSecret });
  return new CloudinaryImageStorage({ client, folder: 'toyflow/avatars' });
}

function createDefaultIdentityStorage(): IdentityImageStorage {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      async upload() {
        return {
          publicId: 'toyflow/identity/mock-doc',
          deliveryType: 'authenticated',
        };
      },
      async delete() {},
      async getAuthorizedDelivery(publicId: string) {
        return {
          url: `https://api.cloudinary.com/download?publicId=${encodeURIComponent(publicId)}`,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        };
      },
    };
  }

  const client = configureCloudinary({ cloudName, apiKey, apiSecret });
  return new CloudinaryIdentityStorage({ client, folder: 'toyflow/identity' });
}

export function createUC03Dependencies(
  options?: CreateUC03DependenciesOptions,
): UC03Dependencies {
  const avatarStorage = options?.avatarStorage ?? createDefaultAvatarStorage();
  const identityStorage = options?.identityStorage ?? createDefaultIdentityStorage();
  const events = options?.events ?? new DefaultIdentityVerificationEvents();

  const usersService =
    options?.usersService ?? new UsersService(User, avatarStorage);
  const usersRouter = createUsersRouter(usersService);

  const identityVerificationService =
    options?.identityVerificationService ??
    new IdentityVerificationService(IdentityVerification, User, identityStorage, events);
  const identityVerificationRouter = createIdentityVerificationRouter(identityVerificationService);

  return {
    usersService,
    usersRouter,
    identityVerificationService,
    identityVerificationRouter,
    avatarStorage,
    identityStorage,
    events,
  };
}
