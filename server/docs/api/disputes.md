# Disputes Feature Module (UC17–UC19)

The `disputes` module handles a complaint about a rental order: a party opens the dispute (UC17), the other party answers once (UC18), and an Admin reviews the case file and issues a verdict that splits the escrowed money (UC19). Only rental orders (`orderType: 'rental_order'`) can be disputed.

Every endpoint requires authentication. Responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code", "message", "details?" } }`.

---

## Lifecycle

```
open ──(respondent answers | 72h without answer)──> under_review ──(Admin verdict)──> resolved
```

- `open`: `timer.dueAt = openedAt + disputeResponseHours` (72h). The order is `DISPUTING` and escrow (`R + D`) stays held.
- `under_review`: `timer` removed, `reviewStartedAt` set. `responseMissed: true` when moved by the expiry job (`DisputeService.expireResponses`).
- `resolved`: `resolution` and `resolvedBy` set; the order is `COMPLETED`. A verdict can never be changed.
- `closed` exists in the model but is not used.

An order has at most one dispute, ever (also after it is resolved).

---

## Endpoints Overview

| Method | Path | Use Case | Actor | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/rentals/:id/disputes` | UC17 | Renter / Owner | Opens the order's dispute; the order moves to `DISPUTING` |
| `GET` | `/api/v1/disputes` | UC17–19 | Party | My disputes, newest first |
| `GET` | `/api/v1/disputes/:id` | UC17–19 | Party | One of my disputes (`404` for anyone else) |
| `POST` | `/api/v1/disputes/:id/response` | UC18 | Respondent | Answers once within 72h; the dispute moves to `under_review` |
| `GET` | `/api/v1/admin/disputes` | UC19 | Admin | Review queue |
| `GET` | `/api/v1/admin/disputes/:id` | UC19 | Admin | Full case file |
| `POST` | `/api/v1/admin/disputes/:id/resolve` | UC19 | Admin | Issues the verdict, splits the escrow, completes the order |

`POST /api/v1/rentals/:id/settle` with `result: 'DAMAGED'` is the Owner's other way to open a dispute; it keeps its own response (the order) and errors.

---

## Detailed Endpoint Specifications

### 1. Open a Dispute (UC17)
- **Method / Path**: `POST /api/v1/rentals/:id/disputes`
- **Content-Type**: `multipart/form-data`
- **Who and when**:
  - Renter: order `IN_USE`, before `rentalStartedAt + renterComplaintHours` (24h).
  - Owner: order `RETURNING`, before the `SETTLEMENT` timer is due (48h inspection).
- **Form Data**:
  - `reason`: Renter `DAMAGED_ON_RECEIPT | MISSING_PARTS | NOT_AS_DESCRIBED | OTHER`; Owner `DAMAGED_ON_RETURN | MISSING_PARTS | OTHER`.
  - `description`: 10–1000 characters (after trim).
  - `photos`: 1–10 images (JPEG, PNG, WebP; max 5MB each).
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "dispute": {
        "id": "...",
        "code": "DP261105AB12CD",
        "orderType": "rental_order",
        "orderId": "...",
        "claimantId": "...",
        "respondentId": "...",
        "claimantRole": "renter",
        "reason": "DAMAGED_ON_RECEIPT",
        "description": "Đồ chơi bị nứt phần thân ngay khi mở hộp.",
        "evidencePhotos": [{ "url": "...", "publicId": "..." }],
        "status": "open",
        "openedAt": "2026-11-05T04:00:00.000Z",
        "responseDueAt": "2026-11-08T04:00:00.000Z"
      },
      "order": { "id": "...", "status": "DISPUTING", "disputeId": "...", "...": "RentalOrderDto" }
    }
  }
  ```
  For an Owner claim, `order.settlement` is `{ result: 'DAMAGED', evidencePhotos, description, settledAt, disputeId }`.
- **Notifications**: the respondent (Owner claim title: `Đơn thuê có khiếu nại đồ chơi bị hỏng`) and every Admin.

### 2. List My Disputes
- **Method / Path**: `GET /api/v1/disputes`
- **Query**: `role` (`claimant | respondent`, optional), `status` (optional), `page` (default 1), `limit` (default 20, max 50).
- **Response (`200 OK`)**: `{ items: DisputeDto[], total, page, limit }`, newest `openedAt` first.

### 3. Get One of My Disputes
- **Method / Path**: `GET /api/v1/disputes/:id`
- **Response (`200 OK`)**: `DisputeDto`. In `resolution.payout` a party sees only `{ renter, owner }`, never the platform share.

### 4. Answer a Dispute (UC18)
- **Method / Path**: `POST /api/v1/disputes/:id/response`
- **Auth**: the respondent only (the claimant gets `403 FORBIDDEN_RENTAL_ACTION`).
- **Content-Type**: `multipart/form-data`
- **Form Data**: `message` (10–1000 characters), `photos` (0–10 images).
- **Response (`200 OK`)**: `DisputeDto` with `status: 'under_review'`, `response { message, photos, respondedAt }`, `reviewStartedAt`.
- **Notifications**: the claimant and every Admin.

### 5. Admin Review Queue (UC19)
- **Method / Path**: `GET /api/v1/admin/disputes`
- **Auth**: Admin (`403 FORBIDDEN` otherwise)
- **Query**: `status` (default `under_review`), `page` (default 1), `limit` (default 20, max 50).
- **Order**: `under_review` by `reviewStartedAt` ascending (oldest first); other statuses by `openedAt` descending.
- **Response (`200 OK`)**: `{ items: AdminDisputeDto[], total, page, limit }`. `AdminDisputeDto` is `DisputeDto` with `resolution.payout.platform`.

### 6. Admin Case File (UC19)
- **Method / Path**: `GET /api/v1/admin/disputes/:id`
- **Auth**: Admin
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "dispute": { "...": "AdminDisputeDto" },
      "claimant": { "id": "...", "fullName": "...", "avatar": "...", "trustScore": 80, "verified": true },
      "respondent": { "id": "...", "fullName": "...", "trustScore": 75, "verified": true },
      "caseFile": {
        "order": { "...": "RentalOrderDto (handover.ownerPhotos, handover.renterPhotos, returnInfo.photos/note)" },
        "history": [{ "oldStatus": "RETURNING", "newStatus": "DISPUTING", "changedBy": "...", "notes": "...", "occurredAt": "..." }],
        "amounts": { "rentalFee": 100000, "depositAmount": 200000, "platformFee": 10000, "lateFee": 0 }
      },
      "compensationCap": 200000,
      "conversation": null,
      "aiAssessment": null
    }
  }
  ```
  Chat and AI assessment are not built yet; they are always `null`.

### 7. Issue the Verdict (UC19)
- **Method / Path**: `POST /api/v1/admin/disputes/:id/resolve`
- **Auth**: Admin
- **Request Body**:
  ```json
  {
    "verdict": "PARTIAL",
    "compensation": 50000,
    "reason": "Ảnh lúc giao và lúc trả cho thấy vết nứt mới xuất hiện sau khi thuê."
  }
  ```
  - `verdict`: `CLAIMANT_FAVORED | RESPONDENT_FAVORED | PARTIAL`.
  - `compensation` (X): integer ≥ 0, at most the cap. `RESPONDENT_FAVORED` ⇒ `X = 0`; the other verdicts ⇒ `X > 0`. When the cap is 0, every verdict takes `X = 0`.
  - `reason`: 30–500 characters (after trim).
- **Effect** (one transaction): dispute `under_review → resolved` with `resolution { verdict, compensation, reason, resolvedAt, payout }` and `resolvedBy`; ledger posting `rental:<orderId>:dispute` splitting the escrow; order `DISPUTING → COMPLETED` with a history row (`changedBy` = the Admin). Either all of it commits or none of it.
- **Response (`200 OK`)**: `AdminDisputeDto` with `status: 'resolved'`.
- **Notifications**: the renter and the Owner, each with the verdict, the order code and the amount they receive.
- A second (or concurrent) verdict gets `409 DISPUTE_NOT_UNDER_REVIEW` and posts nothing.

---

## Payout Formulas

`R` rental fee, `D` deposit, `F` platform fee, `L` late fee (`returnInfo.lateFee`, 0 if the toy was not returned), `X` compensation. The escrow always pays out exactly `R + D`; zero lines are dropped from the posting.

| Claimant | Cap | Owner | Platform | Renter |
|---|---|---|---|---|
| Owner | `D − L` | `R − F + L + X` | `F` | `D − L − X` |
| Renter | `R` | `R − X − F'` | `F' = round(F × (R − X) / R)` | `D + X` |

Example (`R = 100 000`, `D = 200 000`, `F = 10 000`, `L = 0`):
- Owner claim, `X = 50 000`: owner 140 000, platform 10 000, renter 150 000.
- Renter claim, `X = 40 000`: renter 240 000, owner 54 000, platform 6 000.

---

## Error Codes Reference

| Error Code | HTTP Status | Trigger Conditions |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad reason for the claimant's role, description / message / verdict reason length, unknown verdict, `compensation` not an integer ≥ 0, verdict and amount do not match, bad query |
| `INVALID_IMAGE_UPLOAD` | 400 | Wrong number of photos or file too large |
| `COMPLAINT_WINDOW_CLOSED` | 400 | Renter after 24h of `rentalStartedAt`; Owner after the `SETTLEMENT` timer |
| `RESPONSE_WINDOW_CLOSED` | 400 | Answer after the 72h response window |
| `COMPENSATION_TOO_HIGH` | 400 | `compensation` above the cap; `details: { max }` |
| `FORBIDDEN_RENTAL_ACTION` | 403 | The claimant tries to answer their own dispute |
| `FORBIDDEN` | 403 | A non-Admin calls an `/admin/disputes` endpoint |
| `RENTAL_NOT_FOUND` | 404 | The order does not exist or the caller is not a party |
| `DISPUTE_NOT_FOUND` | 404 | The dispute does not exist (or, for party endpoints, the caller is not a party) |
| `INVALID_RENTAL_TRANSITION` | 409 | The order is not `IN_USE` (Renter) / `RETURNING` (Owner) |
| `DISPUTE_ALREADY_EXISTS` | 409 | The order already has a dispute |
| `DISPUTE_NOT_OPEN` | 409 | Answer to a dispute that is no longer `open` |
| `DISPUTE_NOT_UNDER_REVIEW` | 409 | Verdict on a dispute that is not `under_review` (including a second verdict) |

---

## Deployment Note: Drop `one_open_per_order` on Atlas

The old index `one_open_per_order` (unique on `{ orderType, orderId }` with a `partialFilterExpression` on `status: 'open'`) is replaced by `one_per_order` (unique on `{ orderType, orderId }`, no partial filter). MongoDB cannot build the new index while the old one with the same key exists, so drop it **before** deploying:

```js
db.disputes.dropIndex('one_open_per_order');
```

Then let Mongoose build `one_per_order` and `review_queue` (`{ status: 1, reviewStartedAt: 1 }`), or create them by hand. If an order already has two disputes, `one_per_order` fails to build; resolve the duplicates first.
