# AI Toy Advisor API

The `ai` module answers a parent's question with short advice and at most 5 real toys for rent or sale.
Design, user stories (`US-xx`), business rules (`BR-xx`) and token optimisation (section 8):
[server/docs/ai-advisor-design.md](../ai-advisor-design.md).
Configuration (environment variables): the "AI toy advisor" section of [server/README.md](../../README.md).

---

## Endpoints

### 1. Ask the advisor
- **Method / Path**: `POST /api/v1/ai/advisor`
- **Auth**: User token (`401` without a token, `403` for an Admin)
- **Code**: `routes/ai.routes.ts` → `AiAdvisorController.ask` → `AiAdvisorService.ask`
- **Request Body**:
  ```json
  {
    "message": "Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k",
    "filters": { "ageYears": 4, "category": "any", "listingType": "any", "maxPrice": null, "area": "" },
    "history": [{ "role": "assistant", "text": "Bạn đang tìm đồ chơi cho bé mấy tuổi?" }],
    "filtersFromButtons": false
  }
  ```
- **Validation**:
  - `message`: trimmed, at most 500 characters; required unless `filtersFromButtons` is `true`.
  - `filters` (optional): the `filters` returned by the previous answer, sent back each turn.
    - `ageYears`: integer 0–18 or `null`;
    - `category`: an active category slug or `"any"`;
    - `listingType`: `"any" | "rent" | "sell"` (donated toys are never suggested);
    - `maxPrice`: VND (daily rate for rentals), `0` or `null` for no limit;
    - `area`: at most 100 characters, kept but not used for filtering.
  - `history` (optional): at most 20 items of `{ role: "user" | "assistant", text ≤ 2000 }`.
    The server sends only the last 2, cut to 300 characters, to Gemini.
  - `filtersFromButtons` (optional, default `false`): `true` skips the filter extraction call.
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "reply": "Đây là các món mình thấy phù hợp với bé.",
      "toys": [
        {
          "id": "6adfe1d362325b45c1adecf0",
          "name": "Bộ xếp hình gỗ 100 chi tiết",
          "listingType": "rent",
          "priceOrRate": 35000,
          "condition": "Như mới (90–99%)",
          "image": "https://res.cloudinary.com/.../toy.jpg",
          "reason": "Hợp với bé 4 tuổi thích xếp hình, giá thuê dưới 150k mỗi ngày."
        }
      ],
      "filters": { "ageYears": 4, "category": "lap-rap-xep-hinh", "listingType": "rent", "maxPrice": 150000, "area": "" },
      "source": "ai"
    }
  }
  ```
- **`source`**:

  | Value | Meaning | Gemini calls |
  |---|---|---|
  | `ai` | Advice written by Gemini for toys found in MongoDB | 1–2 |
  | `faq` | Fixed answer from the FAQ (fees, deposit, renting, verification…); not counted in the daily limit | 0 |
  | `off_topic` | Not about toys; fixed reply, no search | 1 |
  | `no_result` | No toy even after relaxing price and category | 0–1 |
  | `fallback` | Gemini failed, timed out, hit the per-minute queue limit or returned broken JSON: plain search results with a notice | 0–2 |

- **Errors** (standard error envelope, see [api-conventions.md](../api-conventions.md)):

  | Status | `error.code` | When |
  |---|---|---|
  | `400` | `VALIDATION_ERROR` | Empty or too long message, wrong `history` or `filters` |
  | `401` | `UNAUTHORIZED` | Not signed in |
  | `403` | `FORBIDDEN` | Signed in as an Admin |
  | `429` | `AI_DAILY_LIMIT` | Daily limit used up (`AI_ADVISOR_DAILY_LIMIT`, Vietnam day) |
  | `503` | `AI_ADVISOR_DISABLED` | `AI_ADVISOR_ENABLED` is not `true` |

  Gemini errors never return `500`; they go to `source: fallback`.

#### Example cURL:
```bash
curl -X POST http://localhost:3000/api/v1/ai/advisor \
  -H "Authorization: Bearer <USER_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Bé 4 tuổi thích xếp hình, muốn thuê dưới 150k"}'
```

---

## Logging

Every question writes one `AiRequest` document (collection `airequests`):
`user_id`, `request_type: "advisor"`, `status` (the `source`), `prompt`, `response`,
`token_usage { input, output, thoughts, calls }`, `latency_ms`, `model_name`, `createdAt`.
A logging failure is printed to the console and never breaks the answer.
