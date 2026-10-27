# Models

Every MongoDB collection has one Mongoose model in `src/models/<name>.model.ts`, re-exported from `src/models/index.ts`. Each file registers its model through the `mongoose.models.<Name> || mongoose.model(...)` guard so tests and hot reload can import it more than once.

| File | Model name | Used by | Notes |
|---|---|---|---|
| `ai-request.model.ts` | `AiRequest` | — | Scaffold. |
| `audit-log.model.ts` | `AuditLog` | — | Scaffold. |
| `category.model.ts` | `Category` | categories, toy catalog, toy listings | Public `GET /categories` lists active categories. |
| `conversation.model.ts` | `Conversation` | — | Scaffold. |
| `dispute.model.ts` | `Dispute` | rental-orders (UC11) | Opened when toy condition is DAMAGED upon return. Admin ruling and responses belong to future UC17–UC19. |
| `donation-request.model.ts` | `DonationRequest` | — | Status catalog in `src/constants/donation-status.ts`. |
| `identity-verification.model.ts` | `IdentityVerification` | identity verification, toy listings | UC03. API: `docs/api/identity-verification.md`. |
| `message.model.ts` | `Message` | — | Scaffold. |
| `notification.model.ts` | `Notification` | identity verification, rental-orders | Status updates, deadlines, and handover notifications. |
| `order-status-history.model.ts` | `OrderStatusHistory` | rental-orders | Order timeline tracking status transitions; index `order_timeline`. |
| `organization.model.ts` | `Organization` | — | Scaffold. |
| `otp-request.model.ts` | `OtpRequest` | auth | |
| `payment.model.ts` | `Payment` | — | Payment records behind external payment gateway (UC20). |
| `purchase-order.model.ts` | `PurchaseOrder` | toy catalog, toy listings | Status catalog in `src/constants/resale-order-status.ts`. |
| `refresh-token.model.ts` | `RefreshToken` | auth | |
| `rental-order.model.ts` | `RentalOrder` | rental-orders, toy catalog, toy listings | Complete peer-to-peer rental flow (UC06–UC11). API: `docs/api/rentals.md`. |
| `review.model.ts` | — | — | Empty placeholder; schema not defined yet, not exported from `index.ts`. |
| `system-setting.model.ts` | `SystemSetting` | rental-orders, system-setting | Configurable business values (`rental.ownerResponseHours`, etc.). |
| `toy.model.ts` | `Toy` | toy catalog, toy listings, rental-orders | `bookingVersion` optimistic lock for concurrent bookings. API: `docs/api/toys.md`. |
| `user.model.ts` | `User` | auth, users, identity verification, toy catalog, rental-orders | API: `docs/api/users.md`. |
| `violation-report.model.ts` | `ViolationReport` | — | Scaffold. |
| `voucher.model.ts` | `Voucher` | — | Scaffold. |
| `wallet.model.ts` | `Wallet` | wallets, rental-orders | Double-entry ledger user and system wallets (`escrow`, `platform`, `external`). API: `docs/api/wallets.md`. |
| `wallet-transaction.model.ts` | `WalletTransaction` | wallets, rental-orders | Zero-sum double-entry ledger transactions with idempotent `entryKey` and `postingKey`. |
| `withdrawal-request.model.ts` | `WithdrawalRequest` | — | Scaffold. |

"Scaffold" means the schema exists but no service reads or writes it yet.
