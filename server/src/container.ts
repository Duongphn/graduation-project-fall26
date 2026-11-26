import { type AiAdvisorSettings, aiConfig, GEMINI_QUEUE_MAX_WAIT_MS } from './config/ai.config.js';
import { GeminiAdvisorClient } from './integrations/ai/gemini.client.js';
import { RequestLimiter } from './integrations/ai/request-limiter.js';
import type { AdvisorLlm } from './interfaces/ai-advisor.ports.js';
import { MongoAiAdvisorRepository } from './repositories/ai-advisor.repository.js';
import { AiAssistanceService } from './services/ai-assistance.service.js';
import { sendOtpEmail, sendResetPasswordEmail } from './integrations/email/mailer.js';
import { getDefaultMailer } from './integrations/email/notification-mailer.js';
import type { AuthMailer } from './interfaces/auth.ports.js';
import { AuthService } from './services/auth.service.js';
import { ChatService } from './services/chat.service.js';
import { SocketChatRealtime } from './sockets/chat.socket.js';
import {
  createDefaultAvatarStorage,
  createDefaultIdentityStorage,
  createDefaultRentalPhotoStorage,
  createDefaultToyImageStorage,
} from './integrations/cloudinary/default-storages.js';
import type { ToyImageStorage } from './interfaces/toy-listing.ports.js';
import { IdentityReviewNotifications } from './integrations/events/identity-review-notifications.js';
import { RentalOrderNotifications } from './integrations/events/rental-order-notifications.js';
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
import { RentalDisputeService } from './services/rental-dispute.service.js';
import { RentalOrderService } from './services/rental-order.service.js';
import { RentalSystemService } from './services/rental-system.service.js';
import { RentalTimerService } from './services/rental-timer.service.js';
import { PurchaseOrderService } from './services/purchase-order.service.js';
import { SystemSettingService } from './services/system-setting.service.js';
import { ToyCatalogService } from './services/toy-catalog.service.js';
import { ToyListingService } from './services/toy-listing.service.js';
import { UsersService } from './services/user.service.js';
import { WalletService } from './services/wallet.service.js';
import { env } from './config/env.js';
import { PayOSClient } from './integrations/payos/payos-client.js';
import type { PayOSConfig, PayOSGateway } from './interfaces/payment.ports.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { WithdrawalRepository } from './repositories/withdrawal.repository.js';
import { PayosTopupService } from './services/payos-topup.service.js';
import { WithdrawalService } from './services/withdrawal.service.js';
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
  /** PayOS SDK wrapper and its keys (tests pass a fake gateway) */
  payosGateway?: PayOSGateway;
  payosConfig?: PayOSConfig;
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
  payosTopupService?: PayosTopupService;
  withdrawalService?: WithdrawalService;
  rentalOrderService?: RentalOrderService;
  rentalDisputeService?: RentalDisputeService;
  rentalSystemService?: RentalSystemService;
  rentalTimerService?: RentalTimerService;
  purchaseOrderService?: PurchaseOrderService;
  // Trợ lý AI: bản giả của Gemini và cấu hình (bật/tắt, giới hạn lượt) cho test.
  advisorLlm?: AdvisorLlm;
  aiAdvisorSettings?: Partial<AiAdvisorSettings>;
  aiAssistanceService?: AiAssistanceService;
  chatService?: ChatService;
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
  payosTopupService: PayosTopupService;
  withdrawalService: WithdrawalService;
  rentalOrderService: RentalOrderService;
  rentalDisputeService: RentalDisputeService;
  rentalSystemService: RentalSystemService;
  rentalTimerService: RentalTimerService;
  rentalOrderRepository: RentalOrderRepository;
  purchaseOrderService: PurchaseOrderService;
  aiAssistanceService: AiAssistanceService;
  // Chat (UC25); server.ts attaches chatRealtime to the Socket.IO server.
  chatService: ChatService;
  chatRealtime: SocketChatRealtime;
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
      overrides.identityVerificationEvents ?? new IdentityReviewNotifications(),
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
  const clockNow = () => (overrides.clock ?? systemClock).now();
  const payosConfig = overrides.payosConfig ?? {
    clientId: env.payosClientId,
    apiKey: env.payosApiKey,
    checksumKey: env.payosChecksumKey,
    returnUrl: env.payosReturnUrl,
  };
  const payosTopupService =
    overrides.payosTopupService ??
    new PayosTopupService(
      new PaymentRepository(),
      walletLedger,
      overrides.payosGateway ?? new PayOSClient(payosConfig),
      payosConfig,
      clockNow,
    );
  const withdrawalService =
    overrides.withdrawalService ?? new WithdrawalService(new WithdrawalRepository(), walletLedger, clockNow);

  const rentalPhotoStorage =
    overrides.rentalPhotoStorage ?? createDefaultRentalPhotoStorage();
  const rentalNotifier =
    overrides.rentalNotifier ?? new RentalOrderNotifications();
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
  const rentalDisputeService =
    overrides.rentalDisputeService ?? new RentalDisputeService(rentalDeps);
  const rentalSystemService =
    overrides.rentalSystemService ?? new RentalSystemService(rentalDeps);

  const rentalTimerService =
    overrides.rentalTimerService ??
    new RentalTimerService(
      rentalSystemService,
      rentalOrderRepository,
      clock,
    );

  const purchaseOrderService =
    overrides.purchaseOrderService ?? new PurchaseOrderService(walletLedger);

  // Trợ lý AI: chỉ tạo client Gemini thật khi test không truyền bản giả.
  const aiAssistanceService =
    overrides.aiAssistanceService ?? createAiAssistanceService(overrides, clock);
  const chatRealtime = new SocketChatRealtime();
  const chatService = overrides.chatService ?? new ChatService({ realtime: chatRealtime, clock });

  return {
    toyImageStorage,
    authService,
    usersService,
    identityVerificationService,
    toyListingService,
    toyCatalogService,
    walletService,
    payosTopupService,
    withdrawalService,
    rentalOrderService,
    rentalDisputeService,
    rentalSystemService,
    rentalTimerService,
    rentalOrderRepository,
    purchaseOrderService,
    aiAssistanceService,
    chatService,
    chatRealtime,
  };
}

function createAiAssistanceService(
  overrides: ContainerOverrides,
  clock: Clock,
): AiAssistanceService {
  const settings = { ...aiConfig.advisor, ...overrides.aiAdvisorSettings };
  const repository = new MongoAiAdvisorRepository(
    overrides.toyCatalogPorts ?? createToyCatalogPorts(),
  );
  return new AiAssistanceService({
    llm:
      overrides.advisorLlm ??
      new GeminiAdvisorClient({
        apiKey: aiConfig.geminiApiKey,
        modelName: settings.modelName,
        timeoutMs: settings.timeoutMs,
        // Một hàng chờ chung cho cả server: giới hạn của Google tính trên cả key, không theo người dùng.
        limiter:
          settings.requestsPerMinute === null
            ? null
            : new RequestLimiter({
                maxRequests: settings.requestsPerMinute,
                windowMs: 60_000,
                maxWaitMs: GEMINI_QUEUE_MAX_WAIT_MS,
              }),
      }),
    catalog: repository,
    usageLog: repository,
    settings,
    clock,
  });
}
