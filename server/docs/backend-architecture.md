# ToyFlow Backend Architecture Baseline

## Source hierarchy

1. Explicit project decisions, especially D-004.
2. Report 3 Main Business Workflow and Use Cases.
3. Report 1 scope and proposed solution.
4. Report 2 technology, plan and quality controls.
5. General architecture guidance.

## Folder structure

The backend uses a layered MVC structure. Files are named `<singular-kebab-name>.<layer>.ts`.

```text
src/
  server.ts        entry point: connect MongoDB, start HTTP + Socket.IO
  app.ts           createApp(overrides?): Express app and global middleware
  container.ts     createContainer(overrides?): builds adapters and services
  config/          env.ts, database.ts
  routes/          index.ts mounts every router; <x>.routes.ts maps paths to controllers
  controllers/     read the request, call a service, write the response
  services/        business rules; throw AppError
  repositories/    MongoDB queries that are not a single model call (Atlas Search, aggregates, ports)
  models/          one Mongoose model per collection; index.ts re-exports all (see models.md)
  validations/     request validation and parsing
  middlewares/     authenticate, require-actor, require-admin, upload, error-handler, not-found
  interfaces/      ports: what services need from the outside (storage, mailer, events, queries)
  integrations/    port implementations: Cloudinary, email, events
  types/           shared types and DTOs
  constants/       status catalogs
  sockets/         Socket.IO server
  utils/           AppError, image validation
```

## Dependency direction

```text
routes → controllers → services → repositories / models
                          │
                          ▼
                     interfaces  ◄── implemented by integrations
```

`container.ts` is the only module that imports both services and integrations. Tests replace adapters or whole services through `createApp(overrides)`.

ESLint (`no-restricted-imports` in `eslint.config.mjs`) enforces the boundaries:

- `services/` must not import `integrations/`, `controllers/` or `routes/`.
- `controllers/` must not import `models/`, `repositories/` or `integrations/`.
- `routes/` must not import `models/` or `repositories/`.
- `models/` must not import `services/`, `controllers/`, `routes/`, `repositories/`, `integrations/` or `middlewares/`.

## Adding a module

1. Model in `models/` and export it from `models/index.ts`.
2. Ports in `interfaces/` for anything outside MongoDB; queries beyond simple model calls in `repositories/`.
3. Service in `services/`, receiving ports through its constructor.
4. Validation in `validations/`, controller in `controllers/`, router factory `create<X>Router(service)` in `routes/`.
5. Build the service in `container.ts` (with an override for tests) and mount the router in `routes/index.ts`.
6. Tests in `tests/` using `createApp({ ...overrides })` or the router factory directly.

## Workflow mapping

```text
BF-01  auth + identity-verification + users
BF-02  toy-catalog + listings + rental-orders + order-status-history + payments
BF-03  toy-catalog + listings + resale-orders + order-status-history + payments
BF-04  toy-catalog + listings + donations + order-status-history
BF-05  disputes + payments + moderation + ai-assistance
Trust  ratings + chat + notifications
```

## Scope guardrails

- `Shipping` is an informational lifecycle status.
- No delivery-provider integration, delivery fee, tracking code or platform-operated delivery.
- AI is advisory; Admin makes final moderation and dispute decisions.
- Payments and deposits are records around an external service boundary, not an approved licensed wallet.
- Exact status-transition permissions and timer rules remain `[NEEDS CONFIRMATION]`; the scaffold defines status catalogs but deliberately does not implement transition automation.

## First implementation order

1. Auth, user and identity-verification contract.
2. Toy catalog and listing moderation.
3. Order status history.
4. Rental flow BF-02.
5. Resale flow BF-03.
6. Donation flow BF-04.
7. Payment/deposit boundary and dispute flow BF-05 after approval.
8. Ratings, chat, notifications and bounded AI assistance.
