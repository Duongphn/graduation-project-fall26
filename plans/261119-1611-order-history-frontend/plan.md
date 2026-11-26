# Order history frontend

Status: implemented (lint/build/test pass; visual check at 360/768/1440 not yet done) · Branch: feature/uc16-order-history

## Decisions
- Keep existing rentals.css radius (8px) — user chose not to switch to 4px.
- Admin "Tất cả" tab (role=all) lives on /rentals/mine, shown when token role is ADMIN.
- Timeline from `GET /rentals/:id` `timeline` (has actor name/isSystem); `/history` no longer used by UI.
- No group count badges: list API does not return counts.

## Steps
1. `features/rentals/rental-orders-api.ts`: item DTO, timeline, financial breakdown types; list query by role+group.
2. `pages/rental-requests-page.tsx`: role tabs, 6 group filters, URL state (role/group/page), rows from item.toy/counterpart (fixes `toyId` missing in list DTO).
3. New `components/rental-timeline.tsx`, `components/rental-financial-breakdown.tsx`.
4. `pages/rental-request-detail-page.tsx`: use new components, 2-column ≥1024px; action panels unchanged.
5. CSS in `rentals.css` (rp-* tokens), reduced-motion safe hover.
6. Vitest: tab/group URL, breakdown 3 roles, "Tạm tính".

## Acceptance
- frontend `npm run lint`, `npm run build`, `npm test` pass.
- No backend edits.
