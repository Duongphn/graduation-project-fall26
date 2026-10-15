# donation_requests

Donation flow (FE-02, BF-04): requests on posted DONATION toys, by a user or by an Admin for an
organization. Every status move goes through `donation_requests.transition.ts`.

- Organization requests: `requestedBy` is the Admin who filed it, but the requester side is the
  Admin team. Notifications for that side go to every active Admin, and the requester actions
  (cancel, confirm receipt) use the `/admin/donation-requests` routes, which are always audited.
  These requests are not listed in `/donation-requests/mine`. One PENDING request per
  organization and toy (`one_pending_per_organization`).
- Stuck SHIPPING: an Admin may cancel (reason required, toy back to ACTIVE) or confirm receipt
  for a USER receiver (`reason` required, else 422 `REASON_REQUIRED`). Users cannot cancel a
  SHIPPING request.
- Handover photos must be the caller's own `HANDOVER_PHOTO` uploads
  (`toyflow/handovers/<caller id>/<random>`), else 422 `HANDOVER_PHOTO_NOT_OWNED`. They are not
  yet bound to one request.
- `GET /api/v1/users/:userId/donation-summary` is public on purpose (donor profile figure); it
  answers 404 for an unknown user id.
- Receipt photos (GB-20): the receiving user must send at least one own `HANDOVER_PHOTO`
  (`photos` is required by the route schema, 400 `VALIDATION_ERROR`; the service also refuses a
  user confirmation without photos with 422 `HANDOVER_PHOTOS_REQUIRED`). An Admin confirming for
  an organization (no account to upload from) or for a stuck USER receiver may omit photos;
  when given they are recorded as the `RECEIVER_RECEIVED` handover.
- Toy guards (GB-12): while a request is ACCEPTED or SHIPPING the toy is RESERVED and its owner
  cannot edit, hide or delete it (409 `TOY_HAS_ACTIVE_DONATION`, toys feature through the
  `hasActiveDonationRequest` port). The toy writes are conditional on the toy not being
  RESERVED, so an accept that wins a race blocks the owner change (and vice versa).
- Hiding or deleting a toy (`closePendingRequestsForToy`, `donation_requests.lifecycle.ts`):
  its PENDING requests become REJECTED, `decidedBy` the owner, with the reason "Người quyên góp
  đã ẩn/xóa đồ chơi này."; the requesters (the Admin team for an organization) are notified.
- Locked donor (GB-05): a request on a toy whose owner is LOCKED is refused with 409
  `DONOR_LOCKED`.
- Expiry job (R03 job 9, UC Step 5.1_Expiration), `expireStaleRequests(now)` in
  `donation_requests.lifecycle.ts`:
  - PENDING older than `DONATION_PENDING_EXPIRY_DAYS` (system setting, default 14, counted from
    `createdAt`) -> CANCELLED;
  - ACCEPTED and not handed over within `DONATION_HANDOVER_EXPIRY_DAYS` (default 14, counted
    from `decidedAt`) -> CANCELLED and the toy RESERVED -> ACTIVE;
  - SHIPPING never expires (the toy may be on its way): the Admin cancels or confirms.
    Each request moves in its own transaction with a conditional update (a concurrent accept,
    handover or cancel wins or the job wins, never both), `cancellation { reason: EXPIRED,
actorType: SYSTEM }`, a status-history row with actor SYSTEM, an audit row `donation.expire`
    (actorType SYSTEM) and a `DONATION_STATUS_CHANGED` event (both sides notified). A setting of
    0 or less turns that rule off. The R03 text gives no number of days for PENDING requests;
    14 days is our default (the same as the handover window) until the team decides.
    It runs inside the server every `DONATION_EXPIRY_JOB_INTERVAL_MINUTES` (default 5, from the
    NFR "automatic actions within 5 minutes after their deadline"; R03 lists the job daily at
    3:00 AM), never in tests, without overlapping runs (`src/app/jobs/`). Turn it off with
    `DONATION_EXPIRY_JOB_ENABLED=false`; run it once with `npm run jobs:expire-donations`.

## Decisions

- D-03 Contact sharing: while a request is ACCEPTED or SHIPPING, the user views (`/mine`,
  `/incoming`, `GET /:id` and the move responses) carry `counterpartContact: { name, phone }`
  with the full name and full phone (never the email) of the other party: the Donor sees the
  requesting user, or the organization's `name` and `phone` (organizations collection); the
  requesting USER sees the Donor. Before acceptance and after COMPLETED / CANCELLED / REJECTED
  it is `null`. Admin routes are unchanged (masked contacts, `counterpartContact` always
  `null`). Rule in `counterpartOf` (policy), applied in the mapper; no extra endpoint.
- D-04 Donor decides: only the Donor accepts or rejects (user routes; anyone else 403, also
  the Admin who filed an organization request). `POST /admin/donation-requests/:id/accept` and
  `/reject` answer 409 `DONOR_DECISION_REQUIRED` for a PENDING request (409
  `INVALID_STATUS_TRANSITION` for other statuses). Admins only resolve stuck ACCEPTED/SHIPPING
  requests (cancel with a reason, confirm receipt) and may cancel a PENDING request.
- D-05 Expiry: `DONATION_PENDING_EXPIRY_DAYS` stays 14 (default, also for ACCEPTED handover)
  and the job runs every 5 minutes (`DONATION_EXPIRY_JOB_INTERVAL_MINUTES`), see above.
