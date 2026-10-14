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
