# ToyFlow Backend

Backend implementation for the ToyFlow graduation project. The current baseline follows the MERN technology decision in Report 2 and the business workflows BF-01 to BF-05 in Report 3.

## Technology

- TypeScript and Node.js (Node 20+)
- Express.js
- MongoDB with Mongoose (Replica Set required for transactions)
- Socket.IO for future real-time chat and notifications
- Vitest and Supertest

## Architecture

The backend uses a layered MVC structure:

```text
src/
  server.ts  app.ts  container.ts
  config/  routes/  controllers/  services/  repositories/  models/  validations/
  middlewares/  interfaces/  integrations/  types/  constants/  sockets/  utils/
```

Requests flow `routes → controllers → services → repositories / models`. Services depend on ports in `interfaces/`; `container.ts` wires the Cloudinary, email and event adapters from `integrations/` into them. ESLint enforces these boundaries.

- Architecture and how to add a module: [`docs/backend-architecture.md`](docs/backend-architecture.md)
- Collections: [`docs/models.md`](docs/models.md)
- Endpoints: [`docs/api/`](docs/api/) (users, identity verification, toys, rentals, wallets)
- Response format: [`docs/api-conventions.md`](docs/api-conventions.md)

## Business modules

| Workflow/report area | Backend module | Status |
|---|---|---|
| BF-01 Registration and Verification | `auth`, `identity-verification`, `users` | Implemented (UC01–UC03) |
| Toy discovery and listing moderation | `toy-catalog`, `listings`, `moderation` | Implemented (UC04–UC05) |
| BF-02 Rental and Return | `rental-orders`, `order-status-history`, `wallets` | Implemented (UC06–UC11) |
| BF-03 Resale | `resale-orders`, `order-status-history`, `payments` | Scaffold |
| BF-04 Donation | `donations`, `order-status-history` | Scaffold |
| BF-05 Dispute and Deposit Settlement | `disputes`, `payments`, `ai-assistance` | Disputes opened on return condition DAMAGED (UC11) |
| Trust and communication | `ratings`, `chat`, `notifications` | In-app notifications integrated |

`Shipping` is an order status only. ToyFlow does not operate delivery, select delivery providers, calculate delivery fees or manage tracking codes.

## Getting started

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

> **Note**: The rental order and wallet features use MongoDB multi-document transactions (`withTransaction`), which require MongoDB to run as a replica set.
> - For local development: start `mongod --replSet rs0` and run `rs.initiate()` in `mongosh`.
> - Automated Vitest tests use an in-memory replica set (`mongodb-memory-server`) automatically without needing a local mongod daemon.

Default health endpoint: `GET /api/v1/health`. Home page showcase: `GET /api/v1/toys/showcase`; search: `GET /api/v1/toys` (Atlas Search).

## Background jobs

ToyFlow runs background interval jobs started in `server.ts`:
- **Donation expiry job**: runs every 5 minutes (`DONATION_EXPIRY_JOB_ENABLED`, `DONATION_EXPIRY_JOB_INTERVAL_MINUTES`).
- **Shared order timers job**: runs every 1 minute (`ORDER_TIMERS_JOB_ENABLED`, `ORDER_TIMERS_JOB_INTERVAL_MINUTES`). `RENTAL_SCHEDULER_ENABLED=false` is also recognized as an alias to disable this job.

### Adding an order timer source (UC12/UC13)

When implementing timers for another order flow (e.g. resale/purchase in UC12/UC13):
1. Implement the `DueTimerSource` interface from `src/interfaces/order-timer.ports.ts` (`name: string`, `runDue(now: Date): Promise<{ processed: number; failed: number }>`).
2. Pass the new service instance into `startOrderTimersJob([container.rentalTimerService, newPurchaseTimerSource])` in `src/server.ts`.
3. Read timing durations from `SystemSetting` using `SystemSettingService.getNumbers(PURCHASE_TIMING_PREFIX, DEFAULT_PURCHASE_TIMINGS)`.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run lint
```
