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
| AI toy advisor | `ai` (`POST /api/v1/ai/advisor`) | Implemented: Gemini suggestions, FAQ, fallback, usage logs |

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

## AI toy advisor

`POST /api/v1/ai/advisor` (signed-in users) answers a parent's question in Vietnamese with at most 5 real, approved toys for rent or sale (donated toys are never suggested). AI only suggests; the parent decides.

Configure it in `.env` (the API key stays on the server, never in the frontend):

| Variable | Default | Meaning |
|---|---|---|
| `AI_ADVISOR_ENABLED` | `false` | `false`: the endpoint returns `503`, nothing else is affected |
| `GEMINI_API_KEY` | (empty) | Without a key every question falls back to plain search results |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model name (needs `thinkingLevel` support) |
| `GEMINI_TIMEOUT_MS` | `8000` | Slower calls fall back to plain search results |
| `AI_ADVISOR_DAILY_LIMIT` | `20` | Questions per user per day (Vietnam time); FAQ answers are not counted |

Flow: feature flag, sign-in and validation, FAQ (no Gemini), daily limit, Gemini call 1 (filters, skipped when `filtersFromButtons`), MongoDB search with relaxed filters (price, then category), Gemini call 2 (advice), server-side check of the picked ids. Every question writes one `AiRequest` (status, tokens, latency, model).

Try the prompts against the real Gemini and print token counts (needs `GEMINI_API_KEY`, no database):

```bash
npm run ai:try-prompts
```

Example request:

```http
POST /api/v1/ai/advisor
Authorization: Bearer <access token>
Content-Type: application/json

{ "message": "Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k", "history": [], "filtersFromButtons": false }
```

The response `data.filters` is the conversation context: send it back as `filters` on the next question.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run lint
npm run ai:try-prompts
```
