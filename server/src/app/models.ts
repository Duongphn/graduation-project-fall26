import mongoose, { type Model } from 'mongoose';

import { AiRequestModel } from '../features/ai_requests/ai_requests.model.js';
import { AuditLogModel } from '../features/audit_logs/audit_logs.model.js';
import { CategoryModel } from '../features/categories/categories.model.js';
import { ConversationModel } from '../features/conversations/conversations.model.js';
import { DisputeModel } from '../features/disputes/disputes.model.js';
import { DonationRequestModel } from '../features/donation_requests/donation_requests.model.js';
import { IdentityVerificationModel } from '../features/identity_verifications/identity_verifications.model.js';
import { MessageModel } from '../features/messages/messages.model.js';
import { NotificationModel } from '../features/notifications/notifications.model.js';
import { OrderStatusHistoryModel } from '../features/order_status_history/order_status_history.model.js';
import { OrganizationModel } from '../features/organizations/organizations.model.js';
import { OtpRequestModel } from '../features/otp_requests/otp_requests.model.js';
import { PaymentModel } from '../features/payments/payments.model.js';
import { PurchaseOrderModel } from '../features/purchase_orders/purchase_orders.model.js';
import { RefreshTokenModel } from '../features/refresh_tokens/refresh_tokens.model.js';
import { RentalOrderModel } from '../features/rental_orders/rental_orders.model.js';
import { ReviewModel } from '../features/reviews/reviews.model.js';
import { SystemSettingModel } from '../features/system_settings/system_settings.model.js';
import { seedDefaultSettings } from '../features/system_settings/system_settings.repository.js';
import { ToyModel } from '../features/toys/toys.model.js';
import { UserModel } from '../features/users/users.model.js';
import { ViolationReportModel } from '../features/violation_reports/violation_reports.model.js';
import { VoucherModel } from '../features/vouchers/vouchers.model.js';
import { WalletTransactionModel } from '../features/wallet_transactions/wallet_transactions.model.js';
import { WalletModel, walletCollectionValidator } from '../features/wallets/wallets.model.js';
import { WithdrawalRequestModel } from '../features/withdrawal_requests/withdrawal_requests.model.js';

/** Every Mongoose model of the application, one per collection. */
export const allModels: readonly Model<never>[] = [
  AiRequestModel,
  AuditLogModel,
  CategoryModel,
  ConversationModel,
  DisputeModel,
  DonationRequestModel,
  IdentityVerificationModel,
  MessageModel,
  NotificationModel,
  OrderStatusHistoryModel,
  OrganizationModel,
  OtpRequestModel,
  PaymentModel,
  PurchaseOrderModel,
  RefreshTokenModel,
  RentalOrderModel,
  ReviewModel,
  SystemSettingModel,
  ToyModel,
  UserModel,
  ViolationReportModel,
  VoucherModel,
  WalletTransactionModel,
  WalletModel,
  WithdrawalRequestModel,
] as unknown as readonly Model<never>[];

/**
 * Creates the collections, brings their indexes in line with the schemas, applies the
 * server-side wallet validator and inserts missing system settings. Run it once per environment (needs the dbAdmin role) and in
 * the database tests.
 */
export const syncDatabase = async (): Promise<void> => {
  for (const model of allModels) {
    await model.createCollection();
    await model.syncIndexes();
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('The database is not connected.');
  }
  await db.command({
    collMod: WalletModel.collection.collectionName,
    validator: walletCollectionValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await seedDefaultSettings();
};
