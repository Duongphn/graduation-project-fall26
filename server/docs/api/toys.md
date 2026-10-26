# Toys Feature Module

The `toys` module provides APIs for toy listing creation, management, search, and availability.

## Endpoints Overview

All routes are mounted under `/api/v1/toys`.

### Public Catalog Endpoints (UC05)

These endpoints do not require authentication (`request.auth`).

#### 1. Search Toy Listings
- **Method / Path**: `GET /api/v1/toys`
- **Query Parameters**:
  - `q` (string, optional): Full-text search keyword over title and description.
  - `type` (`'rent' | 'sell'`, optional): Filter by listing type.
  - `categoryId` (ObjectId string, optional): Filter by category.
  - `ageMin` (integer >= 0, optional): Minimum age boundary for overlapping age range.
  - `ageMax` (integer >= 0, optional): Maximum age boundary for overlapping age range.
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

---

### Owner Listing Management Endpoints (UC04)

These endpoints require an authenticated user actor (`request.auth`).

- `POST /api/v1/toys`: Create a pending toy listing (multipart form data with up to 10 images).
- `GET /api/v1/toys/mine`: List owner's listings (supports `status` filter: `pending`, `active`, `hidden`, `sold`).
- `PATCH /api/v1/toys/:toyId`: Edit an owned listing and add/remove images.
- `POST /api/v1/toys/:toyId/hide`: Hide an owned listing (blocked by unfinished orders with `409`).
- `DELETE /api/v1/toys/:toyId`: Delete an owned listing and its Cloudinary assets (blocked by unfinished orders with `409`).

---

## Infrastructure & Atlas Search Prerequisite

The search endpoint uses MongoDB Atlas Search with index `toys_search`. Refer to [`server/infra/atlas-search/README.md`](../../../infra/atlas-search/README.md) for the JSON index definition and deployment instructions.
