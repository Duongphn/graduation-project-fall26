# Models

Every MongoDB collection has one Mongoose model in `src/models/<name>.model.ts`, re-exported from `src/models/index.ts`. Each file registers its model through the `mongoose.models.<Name> || mongoose.model(...)` guard so tests and hot reload can import it more than once.

| File | Model name | Used by | Notes |
|---|---|---|---|
| `ai-request.model.ts` | `AiRequest` | — | Scaffold. |
| `audit-log.model.ts` | `AuditLog` | — | Scaffold. |
| `category.model.ts` | `Category` | categories, toy catalog, toy listings | Public `GET /categories` lists active categories. |
| `conversation.model.ts` | `Conversation` | — | Scaffold. |
| `dispute.model.ts` | `Dispute` | — | BF-05 case, response, evidence reference, Admin ruling and settlement outcome. Valid evidence and response timers remain [NEEDS CONFIRMATION]. |
| `donation-request.model.ts` | `DonationRequest` | — | Status catalog in `src/constants/donation-status.ts`. |
| `identity-verification.model.ts` | `IdentityVerification` | identity verification, toy listings | UC03. API: `docs/api/identity-verification.md`. |
| `message.model.ts` | `Message` | — | Scaffold. |
| `notification.model.ts` | `Notification` | identity verification events | Status, deadline, moderation and dispute notifications. Channels and retention rules remain [NEEDS CONFIRMATION]. |
| `order-status-history.model.ts` | `OrderStatusHistory` | — | Order timeline; index `order_timeline`. |
| `organization.model.ts` | `Organization` | — | Scaffold. |
| `otp-request.model.ts` | `OtpRequest` | auth | |
| `payment.model.ts` | `Payment` | — | Payment and deposit records behind a future external payment port. Not a licensed wallet or payment intermediary. Provider, escrow and withdrawal boundaries remain [NEEDS CONFIRMATION]. |
| `purchase-order.model.ts` | `PurchaseOrder` | toy catalog, toy listings | Status catalog in `src/constants/resale-order-status.ts`. |
| `refresh-token.model.ts` | `RefreshToken` | auth | |
| `rental-order.model.ts` | `RentalOrder` | toy catalog, toy listings | Status catalog in `src/constants/rental-order-status.ts`. |
| `review.model.ts` | — | — | Empty placeholder; schema not defined yet, not exported from `index.ts`. |
| `system-setting.model.ts` | `SystemSetting` | — | Scaffold. |
| `toy.model.ts` | `Toy` | toy catalog, toy listings | API: `docs/api/toys.md`. |
| `user.model.ts` | `User` | auth, users, identity verification, toy catalog | API: `docs/api/users.md`. |
| `violation-report.model.ts` | `ViolationReport` | — | Scaffold. |
| `voucher.model.ts` | `Voucher` | — | Scaffold. |
| `wallet.model.ts` | `Wallet` | — | Scaffold. |
| `wallet-transaction.model.ts` | `WalletTransaction` | — | Scaffold. |
| `withdrawal-request.model.ts` | `WithdrawalRequest` | — | Scaffold. |

"Scaffold" means the schema exists but no service reads or writes it yet.
