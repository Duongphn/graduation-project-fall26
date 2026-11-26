# Payments — wallet top-up through PayOS (UC17)

The user scans a VietQR with any banking app; the money (real money) goes to the bank account
linked to the PayOS channel. A top-up starts as a **pending** payment (`gateway: payos`,
`code` = the numeric PayOS `orderCode`). It is settled by:

- the **webhook** PayOS posts for each paid transfer (signature checked by the official SDK
  `@payos/node` with the checksum key; the amount must match), or
- the **return page**: PayOS sends the browser to `PAYOS_RETURN_URL`, the frontend calls
  `GET /payments/payos-return`, and the server asks PayOS for the link status. This works where
  PayOS cannot reach the server (local development).

Whichever arrives first settles the payment: in one MongoDB transaction `pending → success` and the
ledger posting `external −amount / user +amount` (`reference.kind = payment`). Only one call can
move the payment out of pending, so the wallet is credited **once**.

Cancelled, expired or failed links become `failed` (`gatewayResponseCode` = PayOS status,
`CANCELLED` shown as cancelled). Partly paid links (`UNDERPAID`) are not credited.

## Configuration (`server/.env`)

| Variable | Meaning |
|---|---|
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Keys of the PayOS payment channel (https://my.payos.vn). Missing → `503 PAYMENT_GATEWAY_NOT_CONFIGURED` |
| `PAYOS_RETURN_URL` | Frontend page PayOS redirects to after paying or cancelling, default `http://localhost:5173/wallet/topup/payos-result` |
| `PAYMENT_EXPIRY_JOB_ENABLED`, `PAYMENT_EXPIRY_JOB_INTERVAL_MINUTES` | Job (default on, every 5 minutes) for top-ups still pending 15 minutes after their link expired: PayOS is asked first — paid → credited, otherwise failed |

Webhook URL to confirm in the PayOS dashboard: `https://<public host>/api/v1/payments/payos-webhook`.

## Endpoints

### 1. Start a top-up
- **Method / Path**: `POST /api/v1/payments/topup/payos`
- **Auth**: User token
- **Body**: `{ "amount": 100000 }` — integer from 10,000 to 100,000,000 VND
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "checkoutUrl": "https://pay.payos.vn/web/...",
      "qrCode": "00020101021238...",
      "paymentCode": "1763600000123",
      "amount": 100000,
      "expiresAt": "2026-11-20T10:15:00.000Z"
    }
  }
  ```
  The transfer note is `NAP VI <orderCode>`; the link expires after 15 minutes.
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `502 PAYOS_GATEWAY_ERROR` (PayOS refused or unreachable; the payment is marked failed), `503 PAYMENT_GATEWAY_NOT_CONFIGURED`.

The response also carries the transfer details (`status`, `bankBin`, `accountNumber`, `accountName`, `description`, `expiresAt`), so the frontend shows **its own QR page** (`/wallet/topup/payos/:code`) instead of sending the user to PayOS; `checkoutUrl` stays as a fallback.

### 2. Transfer details of a top-up
- **Method / Path**: `GET /api/v1/payments/payos/:code`
- **Auth**: User token, owner of the payment (others `404 PAYMENT_NOT_FOUND`)
- **Response (`200 OK`)**: `{ paymentCode, amount, status, expiresAt, qrCode, checkoutUrl, bankBin, accountNumber, accountName, description }` — `qrCode` is the VietQR content; the frontend draws the QR itself.

### 3. Cancel a top-up
- **Method / Path**: `POST /api/v1/payments/payos/:code/cancel`
- **Auth**: User token, owner of the payment
- **Effect**: cancels the PayOS link and marks the payment `failed` (`CANCELLED`). If PayOS refuses (the transfer arrived meanwhile), the real status is checked and a paid transfer is still credited.
- **Response (`200 OK`)**: same shape as the return result (`status: cancelled`, or `success` when it had been paid).

### 4. Return result
- **Method / Path**: `GET /api/v1/payments/payos-return?orderCode=1763600000123` (PayOS also adds `code`, `id`, `cancel`, `status`, ignored)
- **Auth**: User token, owner of the payment (others get `status: not_found`)
- **Response (`200 OK`)**: `success` follows the payment result
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "status": "success",
      "paymentCode": "1763600000123",
      "amount": 100000,
      "message": "Nạp tiền vào ví thành công."
    }
  }
  ```
  `status`: `success` | `pending` (transfer not arrived yet — the page checks again) | `cancelled` | `failed` | `not_found`.

### 5. Webhook
- **Method / Path**: `POST /api/v1/payments/payos-webhook`
- **Auth**: none; the SDK checks the signature. Wrong signature → `400 INVALID_WEBHOOK_SIGNATURE`; otherwise always `200 { success: true, data: { received: true } }` (unknown orders, the confirmation test webhook and amount mismatches are ignored).
