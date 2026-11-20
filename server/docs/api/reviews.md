# Reviews and Trust Score Module (UC24)

After a rental order is `COMPLETED`, each party can review the other once. Reviews feed a per-user Trust Score. A Renter whose score is too low cannot rent a high-deposit toy until an Admin allows it.

Responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code", "message", "details?" } }`. All paths are under `/api/v1`.

---

## Endpoints Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/rentals/:id/reviews` | Party | Reviews the other party of a completed order |
| `GET` | `/rentals/:id/reviews` | Party | My review, their review, and whether I can still review |
| `GET` | `/toys/:id/reviews` | Public | Reviews of a toy (written by renters), newest first |
| `GET` | `/users/:id/reviews` | Public | Reviews a user received, newest first |
| `GET` | `/admin/trust-reviews` | Admin | Queue of blocked renters |
| `GET` | `/admin/trust-reviews/:userId` | Admin | Evidence for one user |
| `POST` | `/admin/trust-reviews/:userId/decision` | Admin | `ALLOW` or `KEEP_RESTRICTED` |

---

## Rules

- Only an order in `COMPLETED` can be reviewed, within `rental.reviewWindowDays` (14) of `settlement.settledAt`.
- One review per party per order (unique index `review_once_per_order`).
- The Renter writes `RENTER_TO_OWNER` and must send `toyRating`. The Owner writes `OWNER_TO_RENTER` and must not send `toyRating`.
- `comment` is optional, at most 1000 characters after trim; phone numbers, emails and links are refused.
- Reviews cannot be edited or deleted.
- The reviewee is notified (`Bạn có đánh giá mới`) and their Trust Score is recomputed. A toy rating is added to `toys.rating` in the same transaction.
- The reviewer is shown as `{ id, fullName, avatar? }` only, never phone or email.

---

## 1. Submit a Review
- **Method / Path**: `POST /api/v1/rentals/:id/reviews`
- **Auth**: User token (a party of the order; anyone else gets `404 RENTAL_NOT_FOUND`)
- **Body**:
  ```json
  { "userRating": 5, "toyRating": 4, "comment": "Giao đồ đúng hẹn." }
  ```
  `userRating` and `toyRating` are integers 1 to 5.
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "...",
      "direction": "RENTER_TO_OWNER",
      "reviewer": { "id": "...", "fullName": "Nguyễn Văn A", "avatar": "https://..." },
      "userRating": 5,
      "toyRating": 4,
      "comment": "Giao đồ đúng hẹn.",
      "createdAt": "2026-11-20T04:00:00.000Z"
    }
  }
  ```

## 2. Reviews of an Order
- **Method / Path**: `GET /api/v1/rentals/:id/reviews`
- **Response (`200 OK`)**: `data` is
  ```json
  {
    "myReview": null,
    "theirReview": { "...": "ReviewDto" },
    "canReview": true,
    "reviewDeadline": "2026-12-04T04:00:00.000Z"
  }
  ```
  `canReview` is true when the order is `COMPLETED`, the deadline has not passed and I have not reviewed. `reviewDeadline` is `null` until the order is settled.

## 3. Reviews of a Toy (public)
- **Method / Path**: `GET /api/v1/toys/:id/reviews?page=1&limit=20`
- Only reviews written by renters. Only an `active` toy has public reviews, otherwise `404 TOY_NOT_FOUND`.
- **Response (`200 OK`)**: `data` is `{ "items": [ReviewDto], "total", "page", "limit" }`.

## 4. Reviews a User Received (public)
- **Method / Path**: `GET /api/v1/users/:id/reviews?role=owner|renter&page=1&limit=20`
- `role=owner` returns reviews received as an Owner, `role=renter` as a Renter; omitted returns both. Unknown user: `404 USER_NOT_FOUND`.
- Same page shape as above.

`page` is at least 1 (default 1); `limit` is 1 to 50 (default 20), and a larger value is refused with `400 VALIDATION_ERROR`, not clamped.

Toy DTOs (search, detail, showcase, owner lists) now carry `rating: { "average": number | null, "count": number }`. `average` has one decimal and is `null` when the toy has no rating.

---

## Trust Score

The score is stored on `users.trust` and recomputed when the user receives a review, when the order cancellation or dispute verdict that counts against them happens, on a rent attempt, and when an Admin opens the detail.

Over the last 180 days:

```
reviews < rental.minReviewsForTrust (3)  =>  score = null
otherwise  score = clamp(round(20 * average - 5 * cancellations - 10 * disputesLost), 0, 100)
```

- `average`: mean of `userRating` of the reviews the user received (as Owner or Renter).
- `cancellations`: the user's orders as Renter that expired for non-payment (history note `system:PAYMENT`).
- `disputesLost`: resolved disputes where the user is the respondent and the verdict is `CLAIMANT_FAVORED` or `PARTIAL`.

A `null` score never restricts anyone.

### Rent gate

A Renter is blocked (`403 RENTER_RESTRICTED`) when all of these hold:

1. `score !== null` and `score < rental.minTrustScore` (30);
2. the toy's `depositPrice > rental.trustDepositCap` (500000);
3. the user has no active override (`trust.override.allowedUntil` in the future).

`details` is `{ "score": 25, "minTrustScore": 30, "depositCap": 500000, "queued": false }`. `queued` is `true` only when this very request put the Renter into the Admin queue; then the message is `"Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này. Yêu cầu đã được chuyển cho quản trị viên xem xét."`. In every other blocked case (quote, create while already queued, create after `KEEP_RESTRICTED` at the same score) `queued` is `false` and the message is `"Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này."`.

- `POST /rentals/quote` reports the error but does not queue anything.
- `POST /rentals` also puts the user in the Admin queue (`trust.review.requestedAt`, `lastBlocked`). A user already queued, or one whose last decision was `KEEP_RESTRICTED` at the same score, is not queued again.

Behaviour change: before UC24 any score below 30 blocked a rental whatever the deposit. Now a low score only blocks toys with a deposit above the cap.

### Settings

| Key | Default | Meaning |
|---|---|---|
| `rental.reviewWindowDays` | 14 | Days after settlement a review is accepted |
| `rental.minReviewsForTrust` | 3 | Reviews needed before a score exists |
| `rental.minTrustScore` | 30 | Score below which the gate applies |
| `rental.trustDepositCap` | 500000 | Deposit (VND) above which the gate applies |
| `rental.trustOverrideDays` | 30 | How long an `ALLOW` decision lasts |

---

## Admin: Trust Review Queue

### 5. List the Queue
- **Method / Path**: `GET /api/v1/admin/trust-reviews?page=&limit=`
- Users with `trust.review.requestedAt`, oldest first.
- **Item**:
  ```json
  {
    "userId": "...",
    "fullName": "Nguyễn Văn A",
    "phone": "09******12",
    "score": 25,
    "reviewCount": 4,
    "ratingAverage": 3.5,
    "cancellations": 2,
    "disputesLost": 1,
    "requestedAt": "2026-11-20T04:00:00.000Z",
    "lastBlocked": {
      "attemptAt": "2026-11-20T04:00:00.000Z",
      "toyId": "...",
      "toyTitle": "Lego Technic",
      "depositAmount": 800000
    }
  }
  ```

### 6. Evidence of One User
- **Method / Path**: `GET /api/v1/admin/trust-reviews/:userId`
- Recomputes the score first. `data` is the item fields (here `disputesLost` is a list and the count is `disputesLostCount`) plus:
  - `override`: `{ allowedUntil, decidedBy, decidedAt }` or `null`
  - `lastDecision`: `{ decision, reason, scoreAtDecision, decidedBy, decidedAt }` or `null`
  - `reviews`: up to 20 reviews received in the window, newest first
  - `expiredOrders`: up to 20 `{ orderId, code, expiredAt }`
  - `disputesLost`: up to 20 `{ disputeId, code, verdict, resolvedAt }`

### 7. Decide
- **Method / Path**: `POST /api/v1/admin/trust-reviews/:userId/decision`
- **Body**: `{ "decision": "ALLOW" | "KEEP_RESTRICTED", "reason": "10-500 characters" }`
- `ALLOW` sets an override until now + `rental.trustOverrideDays`. Both decisions remove the user from the queue, store `lastDecision`, notify the user and write an audit log (`trust.allow` or `trust.keep_restricted`).
- **Response (`200 OK`)**: the same body as the detail endpoint.

---

## Error Codes

| Error Code | HTTP | Trigger |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Rating not an integer 1 to 5, missing `toyRating` for a Renter, `toyRating` sent by an Owner, comment over 1000 characters, bad `page`/`limit`/`role`, bad decision or reason length |
| `CONTACT_DETAILS_NOT_ALLOWED` | 400 | Comment contains a phone number, email or link |
| `UNAUTHORIZED` | 401 | Missing token on a user or admin route |
| `FORBIDDEN` | 403 | Non-Admin on `/admin/trust-reviews` |
| `RENTER_RESTRICTED` | 403 | Rent gate; see above (`details.queued`, two message variants) |
| `RENTAL_NOT_FOUND` | 404 | Bad id, unknown order, or caller is not a party |
| `TOY_NOT_FOUND` | 404 | Toy missing or not active |
| `USER_NOT_FOUND` | 404 | Unknown user |
| `ORDER_NOT_COMPLETED` | 409 | Order is not `COMPLETED` |
| `REVIEW_WINDOW_CLOSED` | 409 | Past the review deadline (or order not settled) |
| `ALREADY_REVIEWED` | 409 | The caller already reviewed this order |
| `TRUST_REVIEW_NOT_PENDING` | 409 | The user is no longer in the queue |
