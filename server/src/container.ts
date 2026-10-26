import {
  createDefaultAvatarStorage,
  createDefaultIdentityStorage,
  createDefaultToyImageStorage,
} from './integrations/cloudinary/default-storages.js';
import type { ToyImageStorage } from './integrations/cloudinary/cloudinary-image-storage.js';
import { DefaultIdentityVerificationEvents } from './integrations/events/identity-verification-events.js';
import type {
  IdentityImageStorage,
  IdentityVerificationEvents,
} from './interfaces/identity-verification.ports.js';
import type { ToyCatalogReadPort } from './interfaces/toy-catalog.ports.js';
import type { ToyListingPorts } from './interfaces/toy-listing.ports.js';
import type { UserAvatarStorage } from './interfaces/user.ports.js';
import { IdentityVerification } from './models/identity-verification.model.js';
import { User } from './models/user.model.js';
import { AtlasToyCatalogRepository } from './repositories/atlas-toy-catalog.repository.js';
import {
  createToyCatalogPorts,
  MongoToyCatalogRepository,
} from './repositories/toy-catalog.repository.js';
import { createToyListingPorts } from './repositories/toy-listing.repository.js';
import { IdentityVerificationService } from './services/identity-verification.service.js';
import { ToyCatalogService } from './services/toy-catalog.service.js';
import { ToyListingService } from './services/toy-listing.service.js';
import { UsersService } from './services/user.service.js';
import type { ToyCatalogPorts, ToyCatalogRepository } from './types/toy-catalog.types.js';

/** Thay thế adapter hoặc cả service — dùng trong test để không gọi Cloudinary/MongoDB thật */
export interface ContainerOverrides {
  avatarStorage?: UserAvatarStorage;
  identityImageStorage?: IdentityImageStorage;
  identityVerificationEvents?: IdentityVerificationEvents;
  toyImageStorage?: ToyImageStorage;
  toyListingPorts?: ToyListingPorts;
  toyCatalogReadPort?: ToyCatalogReadPort;
  toyCatalogRepository?: ToyCatalogRepository;
  toyCatalogPorts?: ToyCatalogPorts;
  usersService?: UsersService;
  identityVerificationService?: IdentityVerificationService;
  toyListingService?: ToyListingService;
  toyCatalogService?: ToyCatalogService;
}

export interface Container {
  usersService: UsersService;
  identityVerificationService: IdentityVerificationService;
  toyListingService: ToyListingService;
  toyCatalogService: ToyCatalogService;
}

/**
 * Composition root: nơi duy nhất ghép integrations (Cloudinary, events) và repositories vào services.
 * Adapter mặc định chỉ được tạo khi service tương ứng không bị override.
 */
export function createContainer(overrides: ContainerOverrides = {}): Container {
  const usersService =
    overrides.usersService ??
    new UsersService(User, overrides.avatarStorage ?? createDefaultAvatarStorage());

  const identityVerificationService =
    overrides.identityVerificationService ??
    new IdentityVerificationService(
      IdentityVerification,
      User,
      overrides.identityImageStorage ?? createDefaultIdentityStorage(),
      overrides.identityVerificationEvents ?? new DefaultIdentityVerificationEvents(),
    );

  const toyListingService =
    overrides.toyListingService ??
    new ToyListingService(
      overrides.toyListingPorts ?? createToyListingPorts(),
      overrides.toyImageStorage ?? createDefaultToyImageStorage(),
    );

  const toyCatalogService =
    overrides.toyCatalogService ??
    new ToyCatalogService(
      overrides.toyCatalogReadPort ?? new AtlasToyCatalogRepository(),
      overrides.toyCatalogRepository ?? new MongoToyCatalogRepository(),
      overrides.toyCatalogPorts ?? createToyCatalogPorts(),
    );

  return { usersService, identityVerificationService, toyListingService, toyCatalogService };
}
