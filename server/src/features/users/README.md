# Users Feature (UC03 Profile Management)

Handles user profile retrieval, profile updates, and avatar uploads.

## API Endpoints (`/api/v1/users`)
- `GET /profile`: Get the current authenticated user's profile (`id`, `fullName`, `email`, `phone`, `avatarUrl`, `address`, `verificationStatus`, `role`). Sensitive data (passwordHash, Google ID, internal ID card) is excluded.
- `PATCH /profile`: Update profile fields (`fullName`, `address`). Rejects unauthorized fields outside the allowlist.
- `POST /avatar`: Multipart avatar image upload (max 5 MB, JPEG/PNG/WebP). Replaces user's avatar.

## Security
- Requires Bearer authentication (`authenticate`) and active actor verification (`requireActor`).
- Verified users cannot self-edit verified legal identity fields.
