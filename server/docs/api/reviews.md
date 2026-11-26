# Reviews Module (UC24)

After a rental order is `COMPLETED`, each party can review the other once. Renters also rate the toy, which feeds the toy's public rating.

Reviews do not change `users.trust.score` yet. How reviews should affect the Trust Score (GB-29, UC29) is still to be decided.

Responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code", "message", "details?" } }`. All paths are under `/api/v1`.

---

## Endpoints Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/rentals/:id/reviews` | Party | Reviews the other party of a completed order |
| `GET` | `/rentals/:id/reviews` | Party | My review, their review, and whether I can still review |
| `GET` | `/toys/:id/reviews` | Public | Reviews of a toy (written by renters), newest first |
| `GET` | `/users/:id/reviews` | Public | Reviews a user received, newest first |

---

## Rules

- Only an order in `COMPLETED` can be reviewed, within `rental.reviewWindowDays` (default 14) of the moment it completed: the Admin's ruling (`settlement.resolution.resolvedAt`) for an order that went through a dispute, otherwise the Owner's settlement (`settlement.settledAt`).
- One review per party per order (unique index `review_once_per_order`).
- The Renter writes `RENTER_TO_OWNER` and must send `toyRating`. The Owner writes `OWNER_TO_RENTER` and must not send `toyRating`.
- `comment` is optional, at most 1000 characters after trim; phone numbers, emails and links are refused.
- Reviews cannot be edited or deleted.
- The reviewee is notified (`Bạn có đánh giá mới`). A toy rating is added to `toys.rating` in the same transaction.
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
  `canReview` is true when the order is `COMPLETED`, the deadline has not passed and I have not reviewed. `reviewDeadline` is `null` until the order is completed.

## 3. Reviews of a Toy (public)
- **Method / Path**: `GET /api/v1/toys/:id/reviews?page=1&limit=20`
- Only reviews written by renters. Only an `active` toy has public reviews, otherwise `404 TOY_NOT_FOUND`.
- **Response (`200 OK`)**: `data` is `{ "items": [ReviewDto], "total", "page", "limit" }`.

## 4. Reviews a User Received (public)
- **Method / Path**: `GET /api/v1/users/:id/reviews?role=owner|renter&page=1&limit=20`
- `role=owner` returns reviews received as an Owner, `role=renter` as a Renter; omitted returns both. Unknown user: `404 USER_NOT_FOUND`.
- Same page shape as above.

`page` is at least 1 (default 1); `limit` is 1 to 50 (default 20), and a larger value is refused with `400 VALIDATION_ERROR`, not clamped.

Toy DTOs (search, detail, showcase, owner lists) carry `rating: { "average": number | null, "count": number }`. `average` has one decimal and is `null` when the toy has no rating.

---

## Settings

| Key | Default | Meaning |
|---|---|---|
| `rental.reviewWindowDays` | 14 | Days after the order completes that a review is accepted |

---

## Error Codes

| Error Code | HTTP | Trigger |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Rating not an integer 1 to 5, missing `toyRating` for a Renter, `toyRating` sent by an Owner, comment over 1000 characters, bad `page`/`limit`/`role` |
| `CONTACT_DETAILS_NOT_ALLOWED` | 400 | Comment contains a phone number, email or link |
| `UNAUTHORIZED` | 401 | Missing token on a party route |
| `RENTAL_NOT_FOUND` | 404 | Bad id, unknown order, or caller is not a party |
| `TOY_NOT_FOUND` | 404 | Toy missing or not active |
| `USER_NOT_FOUND` | 404 | Unknown user |
| `ORDER_NOT_COMPLETED` | 409 | Order is not `COMPLETED` |
| `REVIEW_WINDOW_CLOSED` | 409 | Past the review deadline (or order not completed) |
| `ALREADY_REVIEWED` | 409 | The caller already reviewed this order |
