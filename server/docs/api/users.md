# Users Feature (UC03 Profile Management)

Handles user profile retrieval, profile updates, and avatar uploads.

## API Endpoints (`/api/v1/users`)
- `GET /profile`: Get the current authenticated user's profile (`id`, `fullName`, `email`, `phone`, `avatarUrl`, `dateOfBirth` (`YYYY-MM-DD` or null), `gender` (`female` | `male` | `other` | null), `bio` (or null), `trustScore` (read-only, default 100), `memberSince` (ISO date, read-only), `verificationStatus`, `role`). Sensitive data (passwordHash, Google ID, internal ID card) is excluded.
- `PATCH /profile`: Update profile fields (`fullName`, `dateOfBirth`, `gender`, `bio`; `null` or `''` clears the last three). The date of birth must be a real date between 1900-01-01 and today; the bio has at most 200 characters (R03 III.6.1.1 (5)–(7)). Rejects fields outside the allowlist (`400 INVALID_INPUT`).
- `POST /avatar`: Multipart avatar image upload (max 5 MB, JPEG/PNG/WebP). Replaces user's avatar.

### Delivery addresses (R03 III.6.1.1 (9)–(11), R04 3.26 `addresses`)
- `GET /addresses`: active addresses of the current user (`id`, `recipientName`, `phone`, `province`, `ward`, `street`, `isDefault`), the default first, then in the order they were added.
- `POST /addresses` → `201`: add an address. `recipientName` 2–50 characters, `phone` 10 digits starting with 0, `province` and `ward` (no district level), `street` 3–120 characters, optional `isDefault`. The first address becomes the default automatically; `isDefault: true` moves the default label.
- `PATCH /addresses/:addressId`: change any of these fields; `isDefault: true` makes it the default (there is always exactly one default).
- `DELETE /addresses/:addressId` → `204`: hides the address (status `hidden`, never deleted). Deleting the default makes the oldest remaining address the default.
- Another user's or a hidden address answers `404 ADDRESS_NOT_FOUND`; invalid fields `400 VALIDATION_ERROR`.
- The old single profile address (`users.address`) is moved into the address book as the default address the first time the book is read.

## Security
- Requires Bearer authentication (`authenticate`) and active actor verification (`requireActor`).
- Verified users cannot self-edit verified legal identity fields.
