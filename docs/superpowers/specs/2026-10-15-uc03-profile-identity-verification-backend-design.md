# UC03: Profile and Identity Verification Backend Design

**Date:** 2026-10-15
**Status:** Awaiting user review
**Scope:** Backend only
**Project:** ToyFlow

## 1. Purpose

Implement the backend capabilities for UC03 so an authenticated user can manage profile information and submit identity documents, while Admins can review submissions. Users can read the latest status and rejection reason and resubmit after rejection.

The repository already contains `users` and `identity_verifications` feature folders and a Cloudinary image adapter. The existing UC03 design dated 2026-10-13 is a useful starting point, but its proposed fields do not match the current Mongoose models and it does not cover frontend work. This design is limited to backend changes and follows `server/docs/backend-architecture.md`.

## 2. Scope

### Included

- Read and update the authenticated user's profile, including full name, avatar and structured address (province, district, ward, street).
- Upload and replace an avatar using the existing Cloudinary infrastructure.
- Submit phone number, ID card number, front and back ID images, and a portrait image.
- Read the authenticated user's latest verification status and rejection reason.
- Admin endpoints to list pending submissions, read an authorized submission's detail, and approve or reject it with a reason.
- Retain submission history. Permit resubmission after rejection; prevent another submission while pending or after verification.
- Validate input and multipart files, enforce role/ownership authorization, and protect identity images from public access.
- Keep a user's verification state and the corresponding submission decision consistent. Create persistent notification records and emit the existing Socket.IO notification/status events through application wiring where compatible with existing boundaries.

### Excluded

- Frontend or Admin UI.
- Automated OCR, biometric matching, or government identity checks.
- Any unrelated auth, account, address-book, or marketplace changes.

## 3. Architecture and Responsibilities

- `users` owns profile retrieval and updates, avatar upload, and the user's current verification status.
- `identity_verifications` owns submission history, submission state, rejection reason, and Admin review operations.
- Shared infrastructure owns image upload and protected image delivery. The current Cloudinary adapter returns public `secure_url` values, so identity assets must use a protected delivery mechanism and must not be exposed through public profile responses. The implementation must choose a Cloudinary-supported authorization method (authorized short-lived delivery or backend-mediated delivery) after confirming the configured account supports it.
- Cross-feature coordination must use shared contracts/ports or domain events and be wired in `app`; feature modules must not import one another directly.
- Keep response and validation conventions aligned with `docs/superpowers/specs/2026-10-12-api-conventions-design.md` and established feature patterns.

## 4. Domain Data and Rules

### User

Add profile fields for avatar URL/resource identifier, structured address, and `verificationStatus` (`unverified`, `pending`, `verified`, `rejected`). Store identity fields needed for the current verified identity, with uniqueness enforced for verified ID card numbers. A verified user cannot self-edit legal identity fields or submit another dossier. Profile endpoints must never include identity document images.

### IdentityVerification

Each submission records its owner, phone, ID card number, front/back/portrait asset references, status (`pending`, `verified`, `rejected`), submission time, reviewer, review time, and nullable rejection reason. Keep historical records. Enforce at most one pending dossier per user with a partial unique index and handle duplicate-key races as a conflict response.

State transitions:

```text
unverified -> pending -> verified
                       -> rejected -> pending (new submission)
```

Reject requires a non-empty reason. Only pending records may be reviewed. The review decision and user's current state must be persisted consistently (transaction where supported, otherwise a guarded atomic strategy with recovery/compensation). A failed upload must not create a pending record or leave orphaned assets; cleanup uploaded assets if later persistence fails.

## 5. Backend API Surface

All routes require authentication except where the established router explicitly applies equivalent middleware. Admin queue, detail and review routes require the Admin role.

### User profile (`/api/v1/users`)

- `GET /profile`: current user's profile, address and verification status; no ID card images.
- `PATCH /profile`: update allowed profile fields. Prevent changing verified identity fields. Reject attempts to patch fields outside the allowlist.
- `POST /avatar`: multipart avatar upload; validate supported raster image types and size; update avatar reference and clean up a replaced asset where safe.

### Identity verification (`/api/v1/identity-verifications`)

- `POST /`: multipart submission with `frontImage`, `backImage`, `selfie`, `idCardNumber`, and `phone`. Validate VN phone format and ID number; reject verified users and pending duplicates. Accept rejected users for resubmission while preserving previous records.
- `GET /my-latest`: return current latest status, timestamps and rejection reason, without exposing other users' data. Return a well-defined empty result when no submission exists.
- `GET /`: Admin paginated queue, defaulting to pending, with safe user summary fields.
- `GET /:id`: Admin detail with identity image access authorized for Admin; owner access is provided only through an owner-scoped endpoint if document viewing is required.
- `PATCH /:id/review`: Admin action `approve` or `reject`; rejection requires a reason. Return conflict if the dossier is no longer pending.

Use standard success/error envelopes and pagination metadata. Do not return raw Cloudinary public URLs for identity assets.

## 6. Notifications

On approval/rejection, create a persistent notification for the user and publish the status change through existing realtime infrastructure if compatible with the current app composition. Use stable event names consistent with repository conventions; avoid direct imports from the identity feature into notifications or realtime feature modules.

## 7. Security and Failure Handling

- Restrict identity asset types to JPEG, PNG or WebP and cap each file at 5 MB; reject SVG and non-image content.
- Enforce owner/Admin authorization at every identity document read path. Never expose identity assets from profile or listing APIs.
- Use protected image delivery; public asset URLs are not acceptable for CCCD/selfie images.
- Validate multipart fields, lengths, phone and ID format, route IDs, review action and rejection reason.
- Prevent duplicate pending submissions with both business validation and a database partial unique index.
- Guard review transitions against concurrent Admin decisions and keep User/IdentityVerification state consistent.
- Avoid logging ID numbers, phone numbers, image URLs, or upload buffers.

## 8. Verification Plan

The implementation plan should include checks for:

- Profile read/update allowlists, avatar upload validation and verified identity locking.
- Required/invalid multipart fields, unsupported or oversized files, and cleanup on failed persistence.
- Pending duplicate conflict, rejected resubmission with history retention, and verified-user rejection.
- Owner/Admin access boundaries and absence of identity assets in profile responses.
- Admin pagination, pending-only review, mandatory rejection reason, concurrent review conflict, and synchronized user status.
- Notification persistence/event wiring, API typecheck, lint and the repository's relevant existing test commands.

## 9. Open Implementation Detail

Confirm the Cloudinary account's private delivery capabilities before selecting the concrete protected-image mechanism. This does not change the requirement that identity documents remain private; it determines whether delivery uses expiring authorized URLs or an authenticated backend proxy.
