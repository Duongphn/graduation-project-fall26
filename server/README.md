# ToyFlow Backend

Backend scaffold for the ToyFlow graduation project. The current baseline follows the MERN technology decision in Report 2 and the business workflows BF-01 to BF-05 in Report 3.

## Technology

- TypeScript and Node.js
- Express.js
- MongoDB with Mongoose
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
- Endpoints: [`docs/api/`](docs/api/) (users, identity verification, toys)
- Response format: [`docs/api-conventions.md`](docs/api-conventions.md)

## Business modules (planned)

| Workflow/report area | Backend module |
|---|---|
| BF-01 Registration and Verification | `auth`, `identity-verification`, `users` |
| Toy discovery and listing moderation | `toy-catalog`, `listings`, `moderation` |
| BF-02 Rental and Return | `rental-orders`, `order-status-history`, `payments` |
| BF-03 Resale | `resale-orders`, `order-status-history`, `payments` |
| BF-04 Donation | `donations`, `order-status-history` |
| BF-05 Dispute and Deposit Settlement | `disputes`, `payments`, `ai-assistance` |
| Trust and communication | `ratings`, `chat`, `notifications` |

`Shipping` is an order status only. ToyFlow does not operate delivery, select delivery providers, calculate delivery fees or manage tracking codes.

## Getting started

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

`npm run dev` starts `src/server.ts` with hot reload. Default health endpoint: `GET /api/v1/health`. The home page list is served by `GET /api/v1/toys/showcase`; search uses `GET /api/v1/toys` (Atlas Search).

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run lint
```

## Open requirements

The project documents still require approval for the exact actor permission and transition matrix, payment/deposit provider boundary, dispute evidence rules and direct Charity account model. These items are kept as documented TODOs instead of being invented in code.
