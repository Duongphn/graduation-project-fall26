# Models

Every MongoDB collection has one Mongoose model in `src/models/<name>.model.ts`, re-exported from `src/models/index.ts`. Each file registers its model through the `mongoose.models.<Name> || mongoose.model(...)` guard so tests and hot reload can import it more than once.

| File | Model name | Used by | Notes |
|---|---|---|---|
| `address.model.ts` | `Address` | users | Delivery address book (R04 3.26): `status` `active` or `hidden` (deleting hides), at most one active `isDefault` per user (`user_default_address_unique`). API: `docs/api/users.md`. |
| `ai-request.model.ts` | `AiRequest` | — | Scaffold. |
| `audit-log.model.ts` | `AuditLog` | — | Scaffold. |
| `category.model.ts` | `Category` | categories, toy catalog, toy listings | Admin API `/admin/categories` (UC30, screens Category List and Category Detail). `status` is `active` or `hidden` (R04 3.12 Active, Hidden); a category that a toy uses can only be hidden, never deleted (`409 CATEGORY_IN_USE`). The name is unique ignoring case: the service checks it, while the `name_unique` index is case-sensitive. Public `GET /categories` lists active categories, in the same order as the Admin list (`displayOrder`, then the name in Vietnamese order). The list is flat: no code sets `parent_id`, so it stays `null`. Default categories (`src/constants/default-categories.ts`): run `npm run db:seed-categories` once per database; the `system_settings` marker `CATEGORIES_SEEDED` then stops any reseed, so a deleted or renamed category never comes back. |
| `conversation.model.ts` | `Conversation` | chat | UC25. Order chat: `context` {kind RENTAL_ORDER/PURCHASE_ORDER, id}, one per order (`one_per_order`). Listing chat: no `context`, `listingKey` "<toyId>:<userId>", one per listing and user (`one_per_listing_user`). `lastMessage` is the inbox preview. API: Swagger tag Chat. |
| `dispute.model.ts` | `Dispute` | rental-orders (UC11) | Opened when toy condition is DAMAGED upon return, with the 72h reply deadline in `timer.dueAt`. The Admin ruling (UC19) fills `resolution`, `resolvedBy`, `resolvedAt` and sets `status: 'resolved'`. Responses (UC17–UC18) are not built yet. |
| `donation-request.model.ts` | `DonationRequest` | — | Status catalog in `src/constants/donation-status.ts`. |
| `identity-verification.model.ts` | `IdentityVerification` | identity verification, toy listings | UC03. API: `docs/api/identity-verification.md`. |
| `message.model.ts` | `Message` | chat | UC25. `content` is stored already masked (GB-11); `hasSensitiveInfo`/`maskedKinds` drive MSG41. `images` are private CHAT_IMAGE uploads stored as "<publicId>.<format>". `isRead`/`readAt` for read receipts. |
| `notification.model.ts` | `Notification` | identity verification, rental-orders | Status updates, deadlines, and handover notifications. |
| `order-status-history.model.ts` | `OrderStatusHistory` | rental-orders | Order timeline tracking status transitions; index `order_timeline`. |
| `organization.model.ts` | `Organization` | — | Charity organizations (R04 3.8): embedded `receivingPoint`, needs profile (`ageGroups`, `categoryIds`, `areaProvince`, `isRemoteArea`, `isAccepting`). |
| `otp-request.model.ts` | `OtpRequest` | auth | |
| `payment.model.ts` | `Payment` | — | Payment records behind external payment gateway (UC20). |
| `purchase-order.model.ts` | `PurchaseOrder` | toy catalog, toy listings | Status catalog in `src/constants/resale-order-status.ts`. |
| `refresh-token.model.ts` | `RefreshToken` | auth | |
| `rental-order.model.ts` | `RentalOrder` | rental-orders, toy catalog, toy listings | Complete peer-to-peer rental flow (UC06–UC11). API: `docs/api/rentals.md`. |
| `review.model.ts` | — | — | Empty placeholder; schema not defined yet, not exported from `index.ts`. |
| `system-setting.model.ts` | `SystemSetting` | rental-orders, system-setting, category seed | Configurable business values (`rental.ownerResponseHours`, etc.). Also the internal marker `CATEGORIES_SEEDED` written by the category seed (not a business setting). |
| `toy.model.ts` | `Toy` | toy catalog, toy listings, rental-orders | `bookingVersion` optimistic lock for concurrent bookings. API: `docs/api/toys.md`. |
| `user.model.ts` | `User` | auth, users, identity verification, toy catalog, rental-orders | API: `docs/api/users.md`. |
| `violation-report.model.ts` | `ViolationReport` | — | Scaffold. |
| `voucher.model.ts` | `Voucher` | — | Scaffold. |
| `wallet.model.ts` | `Wallet` | wallets, rental-orders | Double-entry ledger user and system wallets (`escrow`, `platform`, `external`). API: `docs/api/wallets.md`. |
| `wallet-transaction.model.ts` | `WalletTransaction` | wallets, rental-orders | Zero-sum double-entry ledger transactions with idempotent `entryKey` and `postingKey`. |
| `withdrawal-request.model.ts` | `WithdrawalRequest` | — | Scaffold. |

"Scaffold" means the schema exists but no service reads or writes it yet.
