# ToyFlow Backend

Backend scaffold for the ToyFlow graduation project. The current baseline follows the MERN technology decision in Report 2 and the business workflows BF-01 to BF-05 in Report 3.

## Technology

- TypeScript and Node.js
- Express.js
- MongoDB with Mongoose
- Socket.IO for future real-time chat and notifications
- Vitest and Supertest

## Architecture

The codebase adapts the feature-based and one-direction dependency principles from [Bulletproof React's project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) to an Express backend:

```text
shared/config/infrastructure -> features -> app
```

- `app`: composition root, HTTP application and route mounting.
- `config`: validated environment configuration.
- `infrastructure`: database and real-time adapters.
- `shared`: cross-feature contracts, errors and middleware.
- `features`: self-contained business modules. A feature must not import another feature directly.

Cross-feature collaboration should use shared contracts, ports or domain events and be wired in `app`.

## Business modules

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

Default health endpoint: `GET /api/v1/health`.

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
