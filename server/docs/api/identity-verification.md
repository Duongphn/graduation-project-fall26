# Identity Verification Feature (UC03)

Manages citizen identity verification submissions, status tracking, and Admin review workflows.

## API Endpoints (`/api/v1/identity-verifications`)

### User Endpoints
- `POST /`: Submit identity verification dossier with multipart images (`frontImage`, `backImage`, `selfie`), VN mobile phone, and 9/12-digit CCCD/CMND.
  - Limits: 5 MB per file, raster image signatures only (JPEG, PNG, WebP). SVG and MIME mismatches are rejected.
  - Concurrency: At most one pending submission per user enforced via database partial unique index.
  - Resubmission: Historical rejected submissions are retained; verified accounts cannot submit.
- `GET /my-latest`: Retrieve user's latest verification status, timestamps, and rejection reason (if rejected). Does not leak private asset URLs.

### Admin Endpoints (Requires `ADMIN` role)
- `GET /`: Paginated Admin queue filtered by status (default: `pending`).
- `GET /:id`: Admin detail view with authorized expiring signed download URLs for private CCCD/selfie assets.
- `PATCH /:id/review`: Approve or reject pending submission. Rejection requires a non-empty `rejectionReason`. Synchronizes user `verificationStatus`, creates persistent notification, and publishes realtime status change events.

## Private Asset Delivery
- All identity documents (CCCD front, back, selfie) are stored with Cloudinary's `type: 'authenticated'` mode in folder `toyflow/identity`.
- Standard public URLs are never stored or exposed.
- Admin access generates expiring signed delivery URLs (default 1 hour expiry) via `IdentityImageStorage.getAuthorizedDelivery()`.
