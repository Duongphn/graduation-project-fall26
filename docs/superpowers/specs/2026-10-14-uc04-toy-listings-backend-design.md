# UC04 Toy Listing Backend Design

## Goal

Implement the backend portion of UC04 for creating and managing rental and resale toy listings. Image assets are stored in Cloudinary. Authentication will be integrated later by the project owner; UC04 must define a strict actor boundary without adding a login or token issuer.

## Current repository context

- The Express API is a TypeScript feature-based scaffold. Its API router currently mounts only health routes.
- `features/toys/toys.model.ts` is an older CommonJS model with title, description, category, condition, listing type, price, deposit, status, and location fields. It has no image or age fields.
- Rental and purchase order models exist, but no order routes or shared repository/service boundary exists.
- An identity verification model exists with a `userId` and status, but no verification routes exist.
- The category model exists. There is no authentication middleware or established request actor property.
- Cloudinary is not currently configured as a dependency or integration.

## Scope

### Included

- Create a listing with multiple images, title, description, category, suitable age range, condition, listing type, and type-specific price fields.
- Upload and validate images before storing them in Cloudinary.
- Require a verified user actor for create operations; require actor ownership for listing management.
- List the current actor's listings with status filter and pagination.
- Edit listing fields and manage its image set.
- Hide and delete listings only when they have no unfinished rental or purchase orders.
- Support listing statuses `pending`, `active`, `hidden`, and `sold` in the owner listing response. `sold` is derived from a completed purchase order; the stored listing status is not overwritten by that derived state.
- Use the existing Express error response convention for validation, authorization, missing records, and order conflicts.

### Excluded

- Login, registration, token creation, or identity verification submission/review flows.
- Admin moderation APIs. New listings start as `pending`; approval remains a separate UC22 integration.
- Rental/purchase order creation or transitions.
- Frontend work.

## Actor and authorization boundary

UC04 routes consume an authenticated actor supplied by future authentication middleware on the Express request. The actor contains a stable user id and user actor type. The feature never accepts an owner id from client input. If the middleware has not populated the actor, protected routes return an unauthorized error.

Create checks that the actor has a corresponding identity verification record with status `verified`. Edit, hide, and delete check that the listing's `ownerId` matches the actor. The feature does not create a fallback or demo identity mechanism.

## Listing data and rules

The toy document stores owner, category, title, description, age range, condition, listing type, images, status, and price fields. Persisted enum values follow the existing lowercase model convention.

- `rent`: requires a positive rental price per day and a non-negative deposit.
- `sell`: requires a positive selling price and always stores quantity as `1`.
- Both types require at least one image and a valid category.
- New listings start in `pending`.
- `pending`, `active`, and `hidden` are stored listing states. `sold` is returned when a completed purchase order exists for the listing.
- The requested owner status filter accepts `pending`, `active`, `hidden`, and `sold`.
- Editing is owner-only. A rejected moderation status may be changed back to `pending` after edit if the existing schema or UC22 integration exposes rejection; moderation itself remains out of scope.

The initial image policy is up to 10 images per listing, JPEG/PNG/WebP, with a 5 MB maximum per image. Validate file size and actual file signature/type, not only the client-provided MIME type. Cloudinary credentials and configuration come from environment variables.

## API shape

All endpoints are under `/api/v1` and require the actor boundary described above.

- `POST /toys`: multipart listing fields plus multiple image files; returns the created pending listing.
- `GET /toys/mine?status=&page=&limit=`: returns only the actor's listings, optionally filtered by status and paginated.
- `PATCH /toys/:toyId`: updates allowed listing fields and optionally adds/removes images. The owner id and status are not client-editable through this route.
- `POST /toys/:toyId/hide`: hides an owned listing if no unfinished order exists.
- `DELETE /toys/:toyId`: deletes an owned listing and its Cloudinary assets if no unfinished order exists.

Responses use the repository's standard JSON error shape. Invalid listing or image data returns a validation error; missing actor returns unauthorized; wrong owner returns forbidden; nonexistent listing returns not found; unfinished orders return conflict.

## Order conflict rule

Before hide/delete, check rental and purchase orders for the listing. An order is finished only in `completed`, `rejected`, `cancelled`, or `expired` states. Any other order state, including dispute, blocks hide/delete. Queries must use the actual stored status casing in the current models, or normalize statuses consistently at the feature boundary.

## Cloudinary lifecycle

Use an isolated Cloudinary adapter/service so listing logic does not depend directly on SDK calls. Upload validated files and persist their secure URLs plus public ids. On edit, remove requested old images and add new uploaded images. On listing deletion, remove all referenced Cloudinary assets. If a database write fails after uploads, attempt to remove the newly uploaded assets to avoid orphaned files. Cloudinary deletion failures must be surfaced or logged without falsely reporting that all assets were deleted.

## Feature boundaries

- `toys`: model, routes, controller, validation, listing service, image metadata and ownership rules.
- `shared`: actor request contract and reusable upload/error types only where needed.
- `infrastructure`: Cloudinary adapter/configuration.
- `app`: mount the toy router and wire dependencies.

Order and identity models are read through narrowly scoped ports/services wired at the composition root, consistent with the repository's rule against feature-to-feature imports.

## Error handling and consistency

- Reject invalid type-specific price combinations and malformed ids before database writes.
- Keep upload and listing lifecycle failures distinguishable from ordinary validation errors.
- Do not accept client-supplied owner, status, sold state, or sell quantity other than the fixed value `1`.
- Avoid deleting image assets until the database operation has succeeded, except cleanup of assets uploaded during a failed create/update.
- Do not hide/delete when an unfinished order is found.

## Verification expectations

Implementation review should cover route wiring, TypeScript compilation, and the feature's validation and error paths. Tests are not added or run unless separately requested.

## Decisions to carry into implementation planning

- Keep the auth integration seam explicit and leave login/token issuance out of scope.
- Keep Cloudinary calls behind an infrastructure adapter.
- Query existing order models through app-wired ports, not direct cross-feature imports.
- Make any mismatch between documented status values and actual legacy model values explicit in the implementation plan before coding.
