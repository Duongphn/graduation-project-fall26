import { sendOtpEmail, sendResetPasswordEmail } from './integrations/email/mailer.js';
import { getDefaultMailer } from './integrations/email/notification-mailer.js';
import type { AuthMailer } from './interfaces/auth.ports.js';
import { AuthService } from './services/auth.service.js';
import {
  createDefaultAvatarStorage,
  createDefaultIdentityStorage,
  createDefaultRentalPhotoStorage,
  createDefaultToyImageStorage,
} from './integrations/cloudinary/default-storages.js';
import type { ToyImageStorage } from './interfaces/toy-listing.ports.js';
import { DefaultIdentityVerificationEvents } from './integrations/events/identity-verification-events.js';
import { NotificationRentalNotifier } from './integrations/events/rental-order-notifier.js';
import type {
  IdentityImageStorage,
  IdentityVerificationEvents,
} from './interfaces/identity-verification.ports.js';
import {
  type Clock,
  type RentalNotifier,
  type RentalPhotoStorage,
  type RentalSettingsProvider,
  systemClock,
} from './interfaces/rental-order.ports.js';
import type { ToyCatalogReadPort } from './interfaces/toy-catalog.ports.js';
import type { ToyListingPorts } from './interfaces/toy-listing.ports.js';
import type { Mailer } from './interfaces/notification.ports.js';
import type { UserAvatarStorage } from './interfaces/user.ports.js';
import type { WalletLedgerPort } from './interfaces/wallet.ports.js';
import { IdentityVerification } from './models/identity-verification.model.js';
import { User } from './models/user.model.js';
import { AtlasToyCatalogRepository } from './repositories/atlas-toy-catalog.repository.js';
import { RentalOrderRepository } from './repositories/rental-order.repository.js';
import {
  createToyCatalogPorts,
  MongoToyCatalogRepository,
} from './repositories/toy-catalog.repository.js';
import { createToyListingPorts } from './repositories/toy-listing.repository.js';
import { WalletLedgerRepository } from './repositories/wallet-ledger.repository.js';
import { setReviewStorage } from './services/identity-review.documents.js';
import { setIdentityReviewService } from './services/identity-review.service.js';
import { IdentityVerificationService } from './services/identity-verification.service.js';
import { setNotificationMailer } from './services/notification.service.js';
import { RentalOrderService } from './services/rental-order.service.js';
import { RentalSystemService } from './services/rental-system.service.js';
import { RentalTimerService } from './services/rental-timer.service.js';
import { SystemSettingService } from './services/system-setting.service.js';
import { ToyCatalogService } from './services/toy-catalog.service.js';
import { ToyListingService } from './services/toy-listing.service.js';
import { UsersService } from './services/user.service.js';
import { WalletService } from './services/wallet.service.js';
import type { ToyCatalogPorts, ToyCatalogRepository } from './types/toy-catalog.types.js';
import { isCloudinaryConfigured } from './utils/cloudinary-signing.js';

/** Thay thế adapter hoặc cả service — dùng trong test để không gọi Cloudinary/MongoDB thật */
export interface ContainerOverrides {
  authMailer?: AuthMailer;
  avatarStorage?: UserAvatarStorage;
  identityImageStorage?: IdentityImageStorage;
  identityVerificationEvents?: IdentityVerificationEvents;
  toyImageStorage?: ToyImageStorage;
  toyListingPorts?: ToyListingPorts;
  toyCatalogReadPort?: ToyCatalogReadPort;
  toyCatalogRepository?: ToyCatalogRepository;
  toyCatalogPorts?: ToyCatalogPorts;
  walletLedger?: WalletLedgerPort;
  rentalPhotoStorage?: RentalPhotoStorage;
  rentalNotifier?: RentalNotifier;
  clock?: Clock;
  rentalSettings?: RentalSettingsProvider;
  rentalOrderRepository?: RentalOrderRepository;
  // Email of the in-app notifications (SMTP when configured, else only logged).
  notificationMailer?: Mailer;
  authService?: AuthService;
  usersService?: UsersService;
  identityVerificationService?: IdentityVerificationService;
  toyListingService?: ToyListingService;
  toyCatalogService?: ToyCatalogService;
  walletService?: WalletService;
  rentalOrderService?: RentalOrderService;
  rentalSystemService?: RentalSystemService;
  rentalTimerService?: RentalTimerService;
}

export interface Container {
  // Shared by the toy listing service and the donation posts router.
  toyImageStorage: ToyImageStorage;
  authService: AuthService;
  usersService: UsersService;
  identityVerificationService: IdentityVerificationService;
  toyListingService: ToyListingService;
  toyCatalogService: ToyCatalogService;
  walletService: WalletService;
  rentalOrderService: RentalOrderService;
  rentalSystemService: RentalSystemService;
  rentalTimerService: RentalTimerService;
  rentalOrderRepository: RentalOrderRepository;
}

/**
 * Composition root: nơi duy nhất ghép integrations (Cloudinary, events) và repositories vào services.
 * Adapter mặc định chỉ được tạo khi service tương ứng không bị override.
 */
export function createContainer(overrides: ContainerOverrides = {}): Container {
  const authService =
    overrides.authService ??
    new AuthService(overrides.authMailer ?? { sendOtpEmail, sendResetPasswordEmail });

  const usersService =
    overrides.usersService ??
    new UsersService(User, overrides.avatarStorage ?? createDefaultAvatarStorage());

  const identityImageStorage = overrides.identityImageStorage ?? createDefaultIdentityStorage();
  const identityVerificationService =
    overrides.identityVerificationService ??
    new IdentityVerificationService(
      IdentityVerification,
      User,
      identityImageStorage,
      overrides.identityVerificationEvents ?? new DefaultIdentityVerificationEvents(),
    );

  // Admin identity review: develop's service for the decision; document links only with real
  // Cloudinary credentials (the unconfigured fallback storage would hand out dead links).
  setIdentityReviewService(identityVerificationService);
  setReviewStorage(
    overrides.identityImageStorage ?? (isCloudinaryConfigured() ? identityImageStorage : null),
  );

  // Donor / Admin notification emails.
  setNotificationMailer(overrides.notificationMailer ?? getDefaultMailer());

  const toyImageStorage = overrides.toyImageStorage ?? createDefaultToyImageStorage();
  const toyListingService =
    overrides.toyListingService ??
    new ToyListingService(overrides.toyListingPorts ?? createToyListingPorts(), toyImageStorage);

  const toyCatalogService =
    overrides.toyCatalogService ??
    new ToyCatalogService(
      overrides.toyCatalogReadPort ?? new AtlasToyCatalogRepository(),
      overrides.toyCatalogRepository ?? new MongoToyCatalogRepository(),
      overrides.toyCatalogPorts ?? createToyCatalogPorts(),
    );

  const walletLedger = overrides.walletLedger ?? new WalletLedgerRepository();
  const walletService = overrides.walletService ?? new WalletService(walletLedger);

  const rentalPhotoStorage =
    overrides.rentalPhotoStorage ?? createDefaultRentalPhotoStorage();
  const rentalNotifier =
    overrides.rentalNotifier ?? new NotificationRentalNotifier();
  const clock = overrides.clock ?? systemClock;
  const rentalSettings = overrides.rentalSettings ?? new SystemSettingService();
  const rentalOrderRepository =
    overrides.rentalOrderRepository ?? new RentalOrderRepository();

  const rentalDeps = {
    ledger: walletLedger,
    photos: rentalPhotoStorage,
    notifier: rentalNotifier,
    clock,
    settings: rentalSettings,
    repository: rentalOrderRepository,
  };
  const rentalOrderService = overrides.rentalOrderService ?? new RentalOrderService(rentalDeps);
  const rentalSystemService =
    overrides.rentalSystemService ?? new RentalSystemService(rentalDeps);

  const rentalTimerService =
    overrides.rentalTimerService ??
    new RentalTimerService(
      rentalSystemService,
      rentalOrderRepository,
      clock,
    );

  return {
    toyImageStorage,
    authService,
    usersService,
    identityVerificationService,
    toyListingService,
    toyCatalogService,
    walletService,
    rentalOrderService,
    rentalSystemService,
    rentalTimerService,
    rentalOrderRepository,
  };
}
