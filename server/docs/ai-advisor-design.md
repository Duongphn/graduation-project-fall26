# UC32 AI Toy Advisor Design

This document is the reference for the codes used in the AI advisor code and tests:
`US-01`…`US-08` (section 5), `BR-01`…`BR-09` (section 6) and "mục 8.1"…"mục 8.7" (section 8).
The API reference is in [server/docs/api/ai.md](api/ai.md).

## 1. Goal

A parent asks in natural Vietnamese ("Bé 4 tuổi thích xếp hình, muốn thuê dưới 50k") and gets a short
piece of advice plus at most 5 real toys that are listed on ToyFlow for **rent or sale**. AI only
suggests; the parent decides. Donated toys are never suggested.

## 2. Mapping to R04 3.4 (UC32)

| R04 3.4 sequence | Code |
|---|---|
| 1. `POST /ai/toy-advice (message)` | `POST /api/v1/ai/toy-advice` (`routes/ai.routes.ts`) |
| `AiAssistanceController` | `controllers/ai-assistance.controller.ts`, handler `getToyAdvice` |
| 2. `getToyAdvice(message)` | `AiAssistanceService.getToyAdvice` (`services/ai-assistance.service.ts`) |
| 3. `buildPrompt(message)` | `services/ai-advisor.prompts.ts` (extraction and advice prompts) |
| 4–5. AI call → search criteria + advice text | Gemini through `@google/genai` (`integrations/ai/gemini.client.ts`): call 1 returns the criteria, call 2 the advice |
| 6–7. `findActive(criteria)` → matching active listings | `MongoAiAdvisorRepository.findActive` (`repositories/ai-advisor.repository.ts`) |
| 8–9. `ToyAdviceDTO (advice, listings)` → `200 OK` | Response `{ advice, listings, filters, source }`; `filters` and `source` are added for follow-up questions and the fallback notice |

Added on top of R04 3.4 (sections 6, 8, 9): FAQ (20 topics), daily limit, per-minute queue, quick filters.
The advisor opens from the card on the home page (`#tro-ly-ai`) and from the floating button on `/toys`.

## 3. Scope

Included: the endpoint, FAQ, daily limit, two-step Gemini flow, MongoDB search with relaxed filters,
fallback, `AiRequest` logging, the home page card, the floating chat on `/toys`, quick filters.

Not included: filtering by area (the `Toy` model has no address field; `area` is
kept in the filters and the reply says it was not used), changes to the `Toy` schema or to the
listing, rental, purchase and payment flows.

## 4. Flow

1. Feature flag (`503` when off) → sign-in (`401`, Admin `403`) → validation (`400`).
2. Mask phone numbers and e-mails in the message and history (BR-09); sanitise the client filters.
3. FAQ match → fixed answer, `source: faq`, no Gemini, not counted (US-03).
4. Daily limit (BR-08) → `429`.
5. Gemini call 1 extracts the filters `{ isToyRelated, ageYears, category, listingType, maxPrice, area }`
   from the question, the current filters and the last 2 messages. Skipped when the filters come
   from the buttons (US-04). `isToyRelated: false` → `source: off_topic`, no search (US-06).
6. Search MongoDB for at most 5 toys; relax price, then category when nothing matches (BR-07).
   Still nothing → `source: no_result`, no second Gemini call.
7. Gemini call 2 writes `{ intro, picks: [{ toyId, reason }] }` for those toys only.
8. The server keeps only picked ids from the list it sent (BR-02, BR-03); name, price, image and
   condition always come from the database.
9. One `AiRequest` log per question (US-07). Any Gemini error → `source: fallback`, HTTP 200 (US-05).

## 5. User stories

| Code | User story | Acceptance criteria |
|---|---|---|
| US-01 | As a parent, I ask in natural language to get suitable toys | Advice plus at most 5 toys; every toy exists, is approved and available |
| US-02 | As a parent, I ask a follow-up ("rẻ hơn được không") without repeating myself | The previous filters are kept; only what the parent just said changes |
| US-03 | As a parent, I ask quick questions about fees, deposit, renting, verification | Answered from the FAQ, without Gemini |
| US-04 | As a parent, I pick the filters with buttons instead of typing | The filter extraction call is skipped; Gemini is called once |
| US-05 | As a parent, I still get results when the AI fails | Gemini error, timeout (when `GEMINI_TIMEOUT_MS` is set) or broken JSON: plain search results for the current filters, with a notice |
| US-06 | As a parent, I am guided when I ask off topic | A fixed reply inviting a toy question; no search |
| US-07 | As the team, we know the real AI cost | Each question logs input, output and thinking tokens, number of calls, latency and status |
| US-08 | As an Admin, I turn the advisor off without affecting other features | `AI_ADVISOR_ENABLED=false` → the endpoint returns `503` |

## 6. Business rules

| Code | Rule |
|---|---|
| BR-01 | Only listings approved by an Admin (`active`), not sold, not the asker's own, for rent or sale |
| BR-02 | The AI may only pick from the toys the server sent; any other `toyId` is dropped |
| BR-03 | At most 5 toys per answer |
| BR-04 | For rental listings the price is the daily rate (`priceOrRate`) |
| BR-05 | For children under 3 the reply warns about small parts (added by the server, not left to the AI) |
| BR-06 | No medical, legal or payment advice; no made-up prices or promotions |
| BR-07 | No match: relax the price, then the category; still nothing → fixed reply, no second Gemini call |
| BR-08 | At most 20 questions per user per day, Vietnam time (`AI_ADVISOR_DAILY_LIMIT`); FAQ answers are not counted |
| BR-09 | No personal data (name, phone, e-mail, address) is sent to Gemini |

## 7. API contract

See [server/docs/api/ai.md](api/ai.md).

## 8. Token optimisation

Code comments refer to these items as "mục 8.1"…"mục 8.7".

1. Search MongoDB first and send at most 5 toys, one line each: id, name, age range, listing type,
   price, condition, description cut to 120 characters (`toyLine` in `ai-advisor.prompts.ts`).
2. Send only the last 2 messages, 300 characters each. The conversation context is the filter JSON
   returned to the client and sent back each turn, not an AI summary.
3. Short English system prompts, fixed between calls; the AI answers in Vietnamese.
4. JSON output with a schema (`responseMimeType: application/json` + `responseJsonSchema`);
   at most 5 picks, each reason at most 25 words.
5. `thinkingConfig: { thinkingLevel: LOW }`.
6. `maxOutputTokens` caps thinking + answer tokens together: 300 for call 1, 800 for call 2.
7. FAQ, filter buttons and the no-result branch avoid Gemini calls (US-03, US-04, BR-07).

Measured on the free tier: about 850 input and 140 output tokens for a question with 2 calls.

## 9. Cost and availability controls

- Daily limit per user (BR-08).
- Per-minute limit for the whole server (`GEMINI_RPM`, default 15): extra requests queue for up to
  30 s, longer waits fall back to plain search results.
- SDK retries are disabled so a `429` or `503` from Google falls back at once.
- `GEMINI_TIMEOUT_MS` is optional; empty means wait until Gemini answers or fails.

## 10. Tests

Gemini is never called in automated tests: the service and API tests use a fake LLM
(`server/tests/support/fake-advisor-llm.ts`) and an in-memory MongoDB.

- `server/tests/ai-assistance.service.test.ts`, `ai-assistance-api.test.ts`: the 14 cases of the brief
  (picks outside the list, unknown category, FAQ, off topic, relaxing, buttons, fallback, `429`,
  `400`, `401`, `503`, history trimming, one log per question).
- `server/tests/ai-advisor.faq.test.ts`: FAQ routing.
- `server/tests/gemini-client.test.ts`, `request-limiter.test.ts`: timeout and queue.
- `frontend/src/features/ai-chat/**/*.test.ts(x)`: chat hook, filters, floating chat.
