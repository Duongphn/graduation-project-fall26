# Rental complaint frontend

Status: implemented (no new tests, per user) · Branch: feature/uc17-19-disputes · Frontend only, backend untouched

## Backend contract (existing)
- `POST /rentals/:id/disputes` multipart: `reason`, `description` (10–1000), `photos` (1–10)
- Renter reasons: DAMAGED_ON_RECEIPT, MISSING_PARTS, NOT_AS_DESCRIBED, OTHER — IN_USE, < 24h after rentalStartedAt
- Owner reasons: DAMAGED_ON_RETURN, MISSING_PARTS, OTHER — RETURNING, before SETTLEMENT timer
- Errors: COMPLAINT_WINDOW_CLOSED, DISPUTE_ALREADY_EXISTS, INVALID_RENTAL_TRANSITION (Vietnamese messages from server)

## Steps
1. `rental-orders-api.ts`: reasons, window constant, `useOpenRentalDispute`.
2. New `components/rental-complaint-form.tsx` (reason, description, photos, confirm).
3. Renter: complaint panel on detail page while IN_USE inside the 24h window, with countdown.
4. Owner: settle panel "Có hư hỏng" uses the complaint form (reason choice) instead of `/settle` DAMAGED.
5. Frontend lint/build/existing tests pass; no new tests (user decision).
