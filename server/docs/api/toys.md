# Toys Feature Module

The `toys` module provides APIs for toy listing creation, management, search, and availability.

## Endpoints Overview

All routes are mounted under `/api/v1/toys`.

### Public Catalog Endpoints (UC05)

These endpoints do not require authentication (`request.auth`).

#### 1. Search Toy Listings
- **Method / Path**: `GET /api/v1/toys`
- **Query Parameters**:
  - `q` (string, optional): Full-text search keyword over title and description. Vietnamese accents are ignored (`nguoi nhen` finds "Người Nhện", `dua` finds "Đua"); see the `vi_folding` analyzer in `infra/atlas-search`.
  - `type` (`'rent' | 'sell'`, optional): Filter by listing type.
  - `categoryId` (ObjectId string, optional): Filter by category.
  - `ageMin` (integer >= 0, optional): Minimum age boundary for overlapping age range.
  - `ageMax` (integer >= 0, optional): Maximum age boundary for overlapping age range.
  - Age ranges are half-open `[minAge, maxAge)` like the R03 age groups (0–1, 1–3, 3–6, 6–12, 12+): `ageMin=6&ageMax=12` returns no 3–6 toy. A toy or a query for one age (`minAge === maxAge`) counts as `[age, age + 1)`. The showcase (4.) uses the same rule.
  - `minPrice` (number >= 0, optional): Lower bound on `priceOrRate`.
  - `maxPrice` (number >= 0, optional): Upper bound on `priceOrRate`.
  - `lat` (number -90..90, optional): Search origin latitude (required together with `lng` and `radiusKm`).
  - `lng` (number -180..180, optional): Search origin longitude (required together with `lat` and `radiusKm`).
  - `radiusKm` (number 0..100, optional): Search radius in kilometers.
  - `sort` (`'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'distance'`, optional):
    - Defaults to `'relevance'` when `q` is provided, otherwise `'newest'`.
    - `'distance'` requires valid coordinates (`lat` and `lng`).
  - `page` (integer >= 1, default: 1): Current page.
  - `limit` (integer 1..100, default: 20): Items per page.
- **Response Shape (`200 OK`)**:
  ```json
  {
    "items": [
      {
        "id": "670cf321...",
        "title": "LEGO Technic Crane",
        "primaryImage": { "url": "https://...", "publicId": "..." },
        "listingType": "rent",
        "priceOrRate": 50000,
        "depositPrice": 200000,
        "category": { "id": "...", "name": "Building Toys", "slug": "building-toys" },
        "ageRange": { "minAge": 8, "maxAge": 14 },
        "condition": "like_new",
        "location": { "type": "Point", "coordinates": [106.66, 10.76] },
        "createdAt": "2026-10-14T..."
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "suggestions": []
  }
  ```
- **Empty Result Suggestions**: When `items` is empty, `suggestions` contains actionable relaxation proposals derived from supplied filters (remove keyword, remove category, widen age range, widen price range, or increase radius).

#### 2. Get Public Toy Listing Detail
- **Method / Path**: `GET /api/v1/toys/:toyId`
- **Response Shape (`200 OK`)**:
  ```json
  {
    "id": "670cf321...",
    "title": "LEGO Technic Crane",
    "description": "Full crane set with remote control...",
    "images": [{ "url": "https://...", "publicId": "..." }],
    "listingType": "rent",
    "priceOrRate": 50000,
    "depositPrice": 200000,
    "category": { "id": "...", "name": "Building Toys", "slug": "building-toys" },
    "ageRange": { "minAge": 8, "maxAge": 14 },
    "condition": "like_new",
    "location": { "type": "Point", "coordinates": [106.66, 10.76] },
    "owner": {
      "id": "670aa...",
      "displayName": "Nguyen Van A"
    },
    "createdAt": "2026-10-14T...",
    "updatedAt": "2026-10-14T..."
  }
  ```
- **Privacy & Status Guard**: Returns `404` for listings that are not `active`, missing, or marked as sold. Owner information strictly exposes only `id` and `displayName` (`fullName`).

#### 3. Get Rental Availability Periods
- **Method / Path**: `GET /api/v1/toys/:toyId/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Query Parameters**:
  - `from` (string YYYY-MM-DD): Start date in UTC (must be current or future).
  - `to` (string YYYY-MM-DD): Inclusive end date in UTC (window must not exceed 180 days).
- **Response Shape (`200 OK`)**:
  ```json
  {
    "periods": [
      {
        "startDate": "2026-10-20",
        "endDate": "2026-10-25"
      }
    ]
  }
  ```
- **Availability Rules**: Returns occupied date ranges from non-terminal rental orders. For sell listings, returns an empty array `[]`.

#### 4. Home Page Showcase
- **Method / Path**: `GET /api/v1/toys/showcase`
- **Purpose**: Plain MongoDB list for the home page sections (no Atlas Search). Sold listings (completed purchase order) are excluded.
- **Query Parameters** (each may appear only once):
  - `listingType` (`'rent' | 'sell'`, optional)
  - `categoryId` (ObjectId string, optional)
  - `minAge`, `maxAge` (integer >= 0, optional; `minAge` must not exceed `maxAge`)
  - `sort` (`'newest' | 'popular'`, default `'newest'`): `popular` puts listings with the most rental orders in the last 7 days first, then the newest.
  - `page` (integer >= 1, default 1), `limit` (integer >= 1, default 20, capped at 100)
- **Response Shape (`200 OK`)**:
  ```json
  {
    "items": [
      {
        "id": "670cf321...",
        "categoryId": "...",
        "title": "LEGO Technic Crane",
        "condition": "Như mới (90–99%)",
        "listingType": "rent",
        "priceOrRate": 25000,
        "depositPrice": 400000,
        "ageRange": { "minAge": 3, "maxAge": 8 },
        "images": [{ "url": "https://..." }],
        "createdAt": "2026-10-14T..."
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  }
  ```
  `depositPrice` is present only for rent listings. Invalid parameters return `400 VALIDATION_ERROR`.

---

### Owner Listing Management Endpoints (UC04)

These endpoints require an authenticated user actor (`request.auth`). An Admin account gets `403 FORBIDDEN`: Admin accounts cannot own or manage toy listings.

- `POST /api/v1/toys`: Create a pending toy listing (multipart form data, field `images`).
- `GET /api/v1/toys/mine`: List owner's listings (supports `status` filter: `pending`, `active`, `hidden`, `sold`).
- `PATCH /api/v1/toys/:toyId`: Edit an owned listing and add/remove images. If another save changed the listing's images after this request read the listing (for example a second tab saving during the upload) and this edit would overwrite them, the edit is refused with `409 LISTING_CHANGED`: nothing is stored and its new images are deleted. Reload the listing and try again.
- `POST /api/v1/toys/:toyId/hide`: Hide an owned listing (blocked by unfinished orders with `409`). A `pending` listing cannot be hidden (`409 LISTING_PENDING_REVIEW`): it offers only Edit and Delete (R03 III.3.2.1).
- `POST /api/v1/toys/:toyId/show`: Show a listing its Owner hid again (GB-08). It is `active` at once when the Admin approved it and it was not edited since; otherwise (edited while hidden, or never approved) it goes back to `pending` with a new `moderation.submittedAt`. `409 LISTING_NOT_HIDDEN` when it is not hidden (or sold), `409 LISTING_REJECTED` for a rejected listing (edit it to send it again), `409 ORDER_IN_PROGRESS` for a donation post being handed over and `409 TOY_DONATED` for one already given away.
- `DELETE /api/v1/toys/:toyId`: Delete an owned listing and its Cloudinary assets (blocked by unfinished orders with `409`).
- For a donation post, an `accepted` or `shipping` donation request counts as an unfinished order (`409 ORDER_IN_PROGRESS`, GB-12, GB-60). Hiding or deleting it rejects its `pending` donation requests with the reason "Người quyên góp đã ẩn/xóa đồ chơi này." and notifies the requesters (D-06).

Field rules (R03 III.3.1.1 and III.3.1.2, R04 `toys`), on create and on the fields an edit sends:

- `title` at most 100 characters; `description` 50 to 1000 characters (both trimmed).
- Rent: `priceOrRate` (VND per day) a whole number from 5,000 to 5,000,000; `depositPrice` a whole number at least `priceOrRate` (one day of rental). An edit that changes the price, the deposit or the type checks them against the stored values it does not send.
- Sale: `priceOrRate` a whole number from 10,000 to 50,000,000.
- A broken rule gives `400 VALIDATION_ERROR` with `details: { field }`. Donation posts (`POST /donation-posts`) use the `title` and `description` rules, not the price rules.

Contact details (R03 GB-11, MSG22), on create and on the fields an edit sends, for rent, sale and donation posts:

- A `title` or `description` with a Vietnamese phone number (`0912345678`, `0912 345 678`, `091.234.5678`, `+84 912 345 678`, a landline such as `024 3826 1234`), an email address, or a link starting with `http://`, `https://` or `www.` gives `400 CONTACT_DETAILS_NOT_ALLOWED` with `details: { field }` (`title` or `description`). The message is Vietnamese, for example "Không được ghi số điện thoại, email hoặc đường link trong mô tả.". Nothing is uploaded or stored.
- Weaker hints never block a save: bank or e-wallet names ("ngân hàng", "Momo"), chat-app names ("Zalo", "TikTok"), long digit runs (a barcode, a serial number) and bare domains ("Tobot.vn"). They stay warnings for the Admin on the moderation screen (`CONTACT_PHONE`, `CONTACT_BANK_ACCOUNT`, `CONTACT_LINK`), which also flags the strong patterns.
- The patterns are in `src/utils/contact-details.ts`; the web form checks the same strong patterns before sending.

Photo rules (R03 GB-10, MSG20, MSG21):

- A rental or sale listing has 3 to 8 photos, after an edit too (kept photos plus new ones, counted for the listing type after the edit). Fewer gives `400 TOO_FEW_PHOTOS` "Please upload at least {n} photos."; more gives `400 TOO_MANY_PHOTOS`. Both carry `details: { min, max }`. A donation post edited here keeps the donation limit of 3 to 10.
- Photos are JPG, PNG or WebP, checked on the file content: any other type, or a file whose content does not match its type, gives `400 INVALID_IMAGE_FORMAT`. A file over 5 MB gives `400 INVALID_IMAGE_UPLOAD` ("Each image must be at most 5 MB."). Nothing is uploaded.

Safety declaration (UC05):

- `POST /toys` and every `PATCH /toys/:toyId` of a rent or sale listing need `safetyDeclaration`: `"true"` in multipart form data or `true` in JSON. It says the Owner ticked every safety commitment of the form. An edit asks for it again because the edit sends the listing back to review.
- A missing declaration, or any other value (`"false"`, `"on"`, `"1"`), gives `400 SAFETY_DECLARATION_REQUIRED` "Vui lòng xác nhận cam kết an toàn trước khi đăng tin." with `details: { field: "safetyDeclaration" }`. Nothing is uploaded or stored.
- Listing responses carry `safetyDeclaredAt`, the time of the last declaration; older listings have none. A donation post edited here needs no declaration.

Review rules (R03 GB-08, BF-02/BF-03 alternative 1a):

- A new listing is `pending` with `moderation.submittedAt` set, which orders the Admin queue (oldest first).
- An edit sends the listing back to `pending`: an `active` (approved) listing leaves the public catalog until the Admin approves it again, and a rejected one (`hidden` with `moderation.rejectReason`) is sent again as a new submission (its reason and review data are removed). A `pending` listing keeps its `submittedAt`; an `active` or rejected one gets a new one. A listing its Owner hid stays `hidden`, with a new `submittedAt`, so showing it again sends it to review. Donation posts keep their status.
- The listing type cannot change once the Admin has approved the listing (R03 GB-09): the listing is `active`, or its last review approved it (also after an edit sent it back to `pending`, or after its Owner hid it). Such an edit gives `400 LISTING_TYPE_LOCKED`. A listing that was never approved, a rejected one included, can change type. A donation post never becomes a rent or sale listing (same error).
- Listing responses carry `moderation` with `submittedAt`, `reviewedAt` and, while the listing is rejected, `rejectReason`. The reviewing Admin's id is not returned.

Category rules:

- Listing responses carry `categoryId` and `categoryName`; the name is also given for a category an Admin has hidden (`GET /categories` lists only active ones), and is `""` if the category no longer exists.
- Create, and an edit that changes `categoryId`, need an active category (`400 CATEGORY_NOT_FOUND` otherwise). An edit that resends the toy's current `categoryId` is accepted even if an Admin hid that category after the toy was posted.
- Create (`POST /toys`, and `POST /donation-posts` for a donation post) and an edit that changes `categoryId` save the toy in a transaction that first writes its category (`$inc __v` while the category is active). An Admin hide or delete running at the same time therefore conflicts with the save: either the toy is refused (`400 CATEGORY_NOT_FOUND`), or the delete sees it (`409 CATEGORY_IN_USE`). Other edits do not write the category and save the toy without a transaction. Like every transaction, this needs a MongoDB replica set.

---

### Create Donation Post (UC33)

`POST /api/v1/donation-posts` creates a free donation post: a toy with `listingType: "donate"` and `priceOrRate: 0`, `pending` until the Admin reviews it like any listing. It needs an authenticated user actor with a verified identity. The post is edited, hidden and deleted with the Owner endpoints above.

Request: multipart form data.

- `title` (required): at most 100 characters.
- `description` (required): 50 to 1000 characters.
- `condition` (required), `categoryId` (required, an active category), `ageRange` (required, JSON `{ "minAge": 1, "maxAge": 3 }`).
- `images`: 3 to 10 photos, JPG, PNG or WebP, at most 5 MB each (R03 GB-10, III.5.2.1 (2)).
- `organizationId` (optional): the organization to send the toy to (UC33 step 4), checked like `POST /donation-requests/to-organization`: active and accepting toys. Without it, the post stays open for requests (FE-02).
- `handoverMethod` (required with `organizationId`): `drop_off` or `carrier`, as its receiving point allows (GB-58, MSG52).
- When the Admin approves the post, the donation request to that organization is created as `pending`, with the Donor as its creator (the Admin decides it, GB-56). If the organization no longer takes toys by then, no request is created and the post stays open.
- Price and deposit fields are ignored.

Errors:

- `401 UNAUTHORIZED`; `403 USER_NOT_VERIFIED` when the identity is not verified.
- `400 VALIDATION_ERROR` for a missing or invalid field, with `details: { field }` for the `title` and `description` lengths; `400 VALIDATION_ERROR` "A donation post needs 3 to 10 images." for fewer than 3 photos.
- `400 CONTACT_DETAILS_NOT_ALLOWED` with `details: { field }` (GB-11, see "Contact details" above).
- `400 CATEGORY_NOT_FOUND` when the category is not active, also when an Admin hides or deletes it during the upload ("Category rules" above).
- `400 INVALID_IMAGE_FORMAT` for a file that is not JPG, PNG or WebP; `400 INVALID_IMAGE_UPLOAD` for an 11th photo or a file over 5 MB.
- With `organizationId`: `400 VALIDATION_ERROR` with `details: { field }` for an invalid id or a missing method; `404 ORGANIZATION_NOT_FOUND`; `409 ORGANIZATION_NOT_AVAILABLE` (hidden) or `409 ORGANIZATION_NOT_ACCEPTING` (MSG51); `422 HANDOVER_METHOD_NOT_ALLOWED`.

Response `201 Created` (`donationTarget` is `null` without an organization):

```json
{
  "success": true,
  "data": {
    "id": "65f...",
    "ownerId": "65e...",
    "categoryId": "64b...",
    "categoryName": "Gấu bông",
    "title": "Gấu bông",
    "description": "Gấu bông còn mới, đã giặt sạch...",
    "condition": "Như mới (90–99%)",
    "listingType": "donate",
    "priceOrRate": 0,
    "ageRange": { "minAge": 1, "maxAge": 3 },
    "images": [{ "url": "https://res.cloudinary.com/...", "publicId": "toyflow/toys/..." }],
    "quantity": 1,
    "status": "pending",
    "donationTarget": { "organizationId": "66a...", "handoverMethod": "drop_off" },
    "createdAt": "2026-11-17T03:00:00.000Z",
    "updatedAt": "2026-11-17T03:00:00.000Z"
  }
}
```

---

## Infrastructure & Atlas Search Prerequisite

The search endpoint uses MongoDB Atlas Search with index `toys_search`. Refer to [`server/infra/atlas-search/README.md`](../../infra/atlas-search/README.md) for the JSON index definition and deployment instructions.
