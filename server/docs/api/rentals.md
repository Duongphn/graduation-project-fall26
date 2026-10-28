# Rentals Feature Module (UC06–UC11, UC14)

The `rentals` module provides APIs for the complete peer-to-peer toy rental workflow: quote and order creation, Owner review, wallet payment into escrow, handover with condition photos, return request with late fee calculation, condition settlement (GOOD or DAMAGED), and order cancellation with escrow refunds.

All routes are mounted under `/api/v1/rentals`. Every endpoint requires authentication (`request.auth`).

---

## Endpoints Overview

| Method | Path | Use Case | Actor | Description |
|---|---|---|---|---|
| `POST` | `/quote` | UC06 | Renter | Calculates price quote and checks calendar availability without booking |
| `POST` | `/` | UC06 | Renter | Creates a rental request (`PENDING`) and holds the calendar dates |
| `GET` | `/` | UC07 | Renter / Owner | Lists rental orders filtered by role (`renter` or `owner`) and optional status |
| `GET` | `/:id` | UC07 | Party | Retrieves order details (includes Renter trust details if actor is Owner) |
| `GET` | `/:id/history` | UC07 | Party | Retrieves chronological order status transition history |
| `POST` | `/:id/accept` | UC07 | Owner | Accepts a pending rental request (`ACCEPTED`), starts 12h payment timer |
| `POST` | `/:id/reject` | UC07 | Owner | Rejects a pending request (`REJECTED`) with a required reason, frees calendar |
| `POST` | `/:id/cancel` | UC14 | Party | Cancels the order under the status policy (`CANCELLED`), refunds escrow for `PAID` orders, frees calendar |
| `POST` | `/:id/pay` | UC08 | Renter | Debits Renter wallet into escrow (`PAID`) |
| `POST` | `/:id/ship` | UC09 | Owner | Uploads handover photos and ships toy (`SHIPPING`), starts 48h receipt timer |
| `POST` | `/:id/receive` | UC09 | Renter | Uploads receipt photos and starts rental period (`IN_USE`) |
| `POST` | `/:id/return` | UC10 | Renter | Uploads return photos, computes late fee (`RETURNING`), starts 72h settlement timer |
| `POST` | `/:id/settle` | UC11 | Owner | Settles as `GOOD` (distributes escrow) or `DAMAGED` (opens Dispute, holds escrow) |

---

## Detailed Endpoint Specifications

### 1. Quote Rental Request (UC06)
- **Method / Path**: `POST /api/v1/rentals/quote`
- **Auth**: User token
- **Request Body**:
  ```json
  {
    "toyId": "64b000000000000000000001",
    "startDate": "2026-11-05",
    "endDate": "2026-11-07"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "available": true,
      "pricing": {
        "days": 3,
        "dailyRate": 50000,
        "rentalFee": 150000,
        "depositAmount": 200000,
        "platformFeeRate": 0.1,
        "platformFee": 15000,
        "totalPayable": 350000
      },
      "conflicts": []
    }
  }
  ```

### 2. Create Rental Request (UC06)
- **Method / Path**: `POST /api/v1/rentals`
- **Auth**: Verified User (trust score >= 30, cannot rent own listing)
- **Request Body**:
  ```json
  {
    "toyId": "64b000000000000000000001",
    "startDate": "2026-11-05",
    "endDate": "2026-11-07"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "6adfe1bb48bae8ee26e82ce4",
      "code": "RO261101ABCDEF",
      "toyId": "64b000000000000000000001",
      "renterId": "...",
      "ownerId": "...",
      "period": {
        "startDate": "2026-11-05",
        "endDate": "2026-11-07"
      },
      "pricing": {
        "days": 3,
        "dailyRate": 50000,
        "rentalFee": 150000,
        "depositAmount": 200000,
        "platformFeeRate": 0.1,
        "platformFee": 15000,
        "totalPayable": 350000
      },
      "status": "PENDING",
      "timer": {
        "kind": "OWNER_RESPONSE",
        "dueAt": "2026-11-02T03:00:00.000Z"
      },
      "createdAt": "2026-11-01T03:00:00.000Z",
      "updatedAt": "2026-11-01T03:00:00.000Z"
    }
  }
  ```

### 3. List Rental Orders (UC07)
- **Method / Path**: `GET /api/v1/rentals`
- **Query Parameters**:
  - `role` (`'renter' | 'owner'`, required): Filter by party role.
  - `status` (`RentalOrderStatus`, optional): Filter by order status.
  - `page` (number >= 1, default: 1)
  - `limit` (number 1..100, default: 20)
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "items": [ /* RentalOrderDto */ ],
      "total": 1,
      "page": 1,
      "limit": 20
    }
  }
  ```

### 4. Get Rental Order Detail (UC07)
- **Method / Path**: `GET /api/v1/rentals/:id`
- **Response (`200 OK`)**:
  Returns `RentalOrderDetailDto`. When requested by the Owner, `renter` information (`fullName`, `avatar`, `trustScore`, `verified`) is included.

### 5. Get Order Status History (UC07)
- **Method / Path**: `GET /api/v1/rentals/:id/history`
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "oldStatus": "PENDING",
        "newStatus": "ACCEPTED",
        "changedBy": "...",
        "occurredAt": "2026-11-01T03:10:00.000Z"
      }
    ]
  }
  ```

### 6. Accept Rental Request (UC07)
- **Method / Path**: `POST /api/v1/rentals/:id/accept`
- **Auth**: Owner only
- **Response (`200 OK`)**: Updates status to `ACCEPTED` and sets `timer { kind: 'PAYMENT', dueAt }`, where `dueAt = min(now + 12h, end of start day)`. Accepting after the 24h response deadline returns `409 INVALID_RENTAL_TRANSITION`, even if the scheduler has not expired the request yet. The Owner response deadline on a new request uses the same cap with 24h, so a same-day booking keeps its deadline until 00:00 VN of the next day.

### 7. Reject Rental Request (UC07)
- **Method / Path**: `POST /api/v1/rentals/:id/reject`
- **Auth**: Owner only
- **Request Body**:
  ```json
  {
    "reason": "Đồ chơi đang được bảo dưỡng định kỳ."
  }
  ```
- **Response (`200 OK`)**: Updates status to `REJECTED`, unsets timer, and frees calendar dates.

### 8. Cancel Rental Order (UC14)
- **Method / Path**: `POST /api/v1/rentals/:id/cancel`
- **Auth**: Party only (Renter or Owner)
- **Request Body**:
  ```json
  {
    "reason": "Đổi kế hoạch gia đình"
  }
  ```
  `reason`: string, required, trimmed, 5–500 characters.
- **Cancellation Policy**:
  | Status | Renter | Owner |
  |---|---|---|
  | `PENDING` | Allowed, no escrow movement | `409 RENTAL_CANCEL_USE_REJECT` (Owner must use reject) |
  | `ACCEPTED` | Allowed, no escrow movement | Allowed, no escrow movement |
  | `PAID` | Allowed: cancel fee = `round(cancelFeeRate * rentalFee)` (default 20%), refund = `totalPayable - fee`. Fee waived (0 fee, 100% refund) if `now >= startOfRental(startDate)` (Owner has not shipped by rental start date) | Allowed: 0 fee, 100% refund (`totalPayable` returned to Renter) |
  | `SHIPPING`, `IN_USE`, `RETURNING`, `DISPUTING` | `409 RENTAL_CANCEL_NOT_ALLOWED` | `409 RENTAL_CANCEL_NOT_ALLOWED` |
  | `COMPLETED`, `REJECTED`, `EXPIRED`, `CANCELLED` | `409 INVALID_RENTAL_TRANSITION` | `409 INVALID_RENTAL_TRANSITION` |

- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "64b000000000000000000002",
      "code": "RNT-123456",
      "status": "CANCELLED",
      "cancellation": {
        "by": "RENTER",
        "userId": "64b000000000000000000010",
        "reason": "Đổi kế hoạch gia đình",
        "fee": 30000,
        "cancelledAt": "2026-11-01T03:00:00.000Z"
      }
    }
  }
  ```

### 9. Pay Rental Order into Escrow (UC08)
- **Method / Path**: `POST /api/v1/rentals/:id/pay`
- **Auth**: Renter only
- **Response (`200 OK`)**: Updates status to `PAID`, posts double-entry transaction debiting Renter `totalPayable` and crediting `escrow`.

### 10. Ship Handover with Photos (UC09)
- **Method / Path**: `POST /api/v1/rentals/:id/ship`
- **Auth**: Owner only
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `photos`: 1–10 image files (JPEG, PNG, WebP; max 5MB each).
- **Response (`200 OK`)**: Updates status to `SHIPPING`, sets `handover.ownerPhotos` and `timer { kind: 'RECEIPT_CONFIRM', dueAt: now + 48h }`.

### 11. Confirm Receipt (UC09)
- **Method / Path**: `POST /api/v1/rentals/:id/receive`
- **Auth**: Renter only
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `photos`: 1–10 image files (receipt condition).
- **Response (`200 OK`)**: Updates status to `IN_USE`, sets `rentalStartedAt: now`, and sets `timer { kind: 'RETURN_REMINDER', dueAt: rentalEnd - 24h }`.

### 12. Request Return with Late Fee (UC10)
- **Method / Path**: `POST /api/v1/rentals/:id/return`
- **Auth**: Renter only
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `photos`: 1–10 image files.
  - `note` (string, optional): Notes up to 500 characters.
- **Response (`200 OK`)**: Computes `lateDays` and `lateFee` (capped at deposit), updates status to `RETURNING`, sets `timer { kind: 'SETTLEMENT', dueAt: now + 72h }`.

### 13. Settle Rental (UC11)
- **Method / Path**: `POST /api/v1/rentals/:id/settle`
- **Auth**: Owner only
- **Content-Type**: `application/json` or `multipart/form-data`
- **Input Parameters**:
  - `result`: `'GOOD'` or `'DAMAGED'`.
  - For `GOOD`: Escrow is distributed (`escrow -(R+D)`, `owner +(R-F+L)`, `platform +F`, `renter +(D-L)`). Order moves to `COMPLETED`.
  - For `DAMAGED`: Requires `description` (10–1000 characters) and 1–10 evidence `photos`. Creates an open `Dispute` record, holds escrow untouched, and order moves to `DISPUTING`. Rejected with `409 INVALID_RENTAL_TRANSITION` once the 72h settlement deadline has passed (the order is then auto-settled as GOOD). `GOOD` is still accepted after the deadline.
- **Response (`200 OK`)**: Updates order to `COMPLETED` or `DISPUTING`.

---

## Error Codes Reference

All error responses adhere to the standard envelope `{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }`.

| Error Code | HTTP Status | Trigger Conditions |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid date format, invalid ObjectId, note > 500 chars, description < 10 or > 1000 chars, invalid status/query, missing or blank cancel/reject reason (< 5 or > 500 chars) |
| `INVALID_IMAGE_UPLOAD` | 400 | Missing required photos (0 files), exceeded limit (> 10 files), or file size > 5 MB |
| `INVALID_IMAGE_FORMAT` | 400 | Uploaded file signature does not match JPEG, PNG, or WebP |
| `CANNOT_RENT_OWN_LISTING` | 403 | Owner attempts to rent their own toy listing |
| `USER_NOT_VERIFIED` | 403 | Renter has not completed identity verification (UC03) |
| `RENTER_RESTRICTED` | 403 | Renter trust score is below minimum threshold (< 30) |
| `FORBIDDEN_RENTAL_ACTION` | 403 | Party invokes an endpoint restricted to the opposite role (e.g. Renter calls `ship` or Owner calls `pay`) |
| `TOY_NOT_FOUND` | 404 | Toy listing does not exist, is inactive, or listingType is not 'rent' |
| `RENTAL_NOT_FOUND` | 404 | Rental order ID does not exist or caller is not a party to the order |
| `RENTAL_DATES_UNAVAILABLE` | 409 | Requested dates overlap an existing active booking. Returns `conflicts` and `suggestion` in `details` |
| `RENTAL_CANCEL_USE_REJECT` | 409 | Owner attempts to cancel a `PENDING` order (must use reject instead) |
| `RENTAL_CANCEL_NOT_ALLOWED` | 409 | Cancelling an order in `SHIPPING`, `IN_USE`, `RETURNING` or `DISPUTING` (open a dispute instead) |
| `INVALID_RENTAL_TRANSITION` | 409 | Action cannot be performed in the current order status or deadline has expired |
| `INSUFFICIENT_BALANCE` | 409 | Renter wallet balance is insufficient to pay totalPayable. Returns `{ required, balance, shortfall }` |
