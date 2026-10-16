# Feature modules

Each feature owns its routes, controller, service, repository/model, validation, domain types and tests when implementation begins.

```text
features/<feature>/
  domain/
  <feature>.routes.ts
  <feature>.controller.ts
  <feature>.service.ts
  <feature>.repository.ts
  <feature>.model.ts
  <feature>.validation.ts
  <feature>.test.ts
  index.ts
```

Planned modules:

- `auth`
- `identity-verification`
- `users`
- `toy-catalog`
- `listings`
- `rental-orders`
- `resale-orders`
- `donations`
- `order-status-history`
- `payments`
- `disputes`
- `ratings`
- `chat`
- `notifications`
- `moderation`
- `ai-assistance`

Rules:

1. Features do not import other features' services, controllers, repositories or routes.
2. Shared contracts contain only concepts used by more than one feature.
3. The `app` layer wires feature dependencies and routes.
4. AI output is advisory; Admin keeps final moderation and dispute authority.
5. There is no delivery/logistics feature under decision D-004.
6. Only repositories import model files (plus `src/infrastructure/database/`, which owns the shared audit-log writer and the development-auth user lookup). A repository may read and write another feature's `<feature>.model.ts` (lookups for its DTOs, or one transaction across collections), but never imports that feature's service, controller or repository. Status catalogs and transition maps live in `src/shared/domain/`. See `docs/database.md`.
