# Payments — wallet top-up through VNPay or PayOS (UC17)

A top-up starts as a **pending** payment. The user pays on VNPay; VNPay then reports the result
twice — the **IPN** (server to server) and the **Return URL** (browser → frontend page →
`GET /payments/vnpay-return`). Whichever arrives first settles the payment: checksum, amount,
then in one MongoDB transaction `pending → success` and the ledger posting
`external −amount / user +amount` (`reference.kind = payment`). Only one call can move the
payment out of pending, so the wallet is credited **once**. Failed or cancelled payments become
`failed`; `gatewayResponseCode` keeps VNPay's code (`24` = cancelled by the user).

Paths and response fields are the same as the lead's wallet branches (`feature/wallet-*`).

## Configuration (`server/.env`)

| Variable | Meaning |
|---|---|
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Sandbox merchant code and hash secret (https://sandbox.vnpayment.vn). Empty → top-up returns `503 PAYMENT_GATEWAY_NOT_CONFIGURED` |
| `VNPAY_URL` | Payment page, default `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` |
| `VNPAY_RETURN_URL` | Frontend page VNPay redirects to, default `http://localhost:5173/wallet/topup/result` |
| `PAYMENT_EXPIRY_JOB_ENABLED`, `PAYMENT_EXPIRY_JOB_INTERVAL_MINUTES` | Job (default on, every 5 minutes) for top-ups still pending 15 minutes after their link expired: VNPay ones become failed; PayOS ones are checked with PayOS first — paid → credited, otherwise failed |

The IPN URL is set in the VNPay merchant portal: `https://<public host>/api/v1/payments/vnpay-ipn`.
Locally VNPay cannot reach the server; the Return URL still settles the payment.

## Endpoints

### 1. Start a top-up
- **Method / Path**: `POST /api/v1/payments/topup/vnpay`
- **Auth**: User token
- **Body**: `{ "amount": 200000, "bankCode": "NCB" }` — `amount` integer from 10,000 to 100,000,000 VND; `bankCode` optional
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=20000000&...&vnp_SecureHash=...",
      "paymentCode": "TOPUP17635196000001234",
      "amount": 200000
    }
  }
  ```
  The link carries `vnp_ExpireDate` = now + 15 minutes. The frontend sends the browser to `paymentUrl`.
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `503 PAYMENT_GATEWAY_NOT_CONFIGURED`.

### 2. Return URL result
- **Method / Path**: `GET /api/v1/payments/vnpay-return?<all vnp_* parameters VNPay redirected with>`
- **Auth**: none (the checksum proves the query). Settles the payment if the IPN has not.
- **Response (`200 OK`)**: `success` follows the payment result
  ```json
  {
    "success": true,
    "data": {
      "success": true,
      "status": "success",
      "paymentCode": "TOPUP17635196000001234",
      "amount": 200000,
      "message": "Nạp tiền vào ví thành công."
    }
  }
  ```
  `status`: `success` | `failed` | `cancelled` (stored as `failed`, code `24`) | `invalid_checksum` | `not_found`.

### 3. IPN
- **Method / Path**: `GET /api/v1/payments/vnpay-ipn?<vnp_* parameters>`
- **Auth**: none. Always `200` with `{ "RspCode": "...", "Message": "..." }`:

| RspCode | Meaning |
|---|---|
| `00` | Confirm Success (this call settled the payment, success or failure) |
| `01` | Order not found |
| `02` | Order already confirmed (settled before by the Return URL, a previous IPN or the expiry job) |
| `04` | Invalid amount |
| `97` | Invalid Checksum |
| `99` | Unknown error |

### 4. Payment status
- **Method / Path**: `GET /api/v1/payments/:code/status`
- **Auth**: User token, owner of the payment only (others get `404 PAYMENT_NOT_FOUND`)
- **Response (`200 OK`)**: `{ code, amount, status, cancelled, gateway, createdAt, expiresAt }`

---

## PayOS — bank transfer by VietQR (real money)

The user scans a VietQR with any banking app; the money goes to the bank account linked to the
PayOS channel. The payment starts **pending** (`gateway: payos`, `code` = the numeric PayOS
`orderCode`). It is settled — wallet credited once through the same transaction as VNPay — by:

- the **webhook** PayOS posts for each paid transfer (signature checked by the official SDK
  `@payos/node` with the checksum key; the amount must match), or
- the **return page**: PayOS sends the browser to `PAYOS_RETURN_URL`, the frontend calls
  `GET /payments/payos-return`, and the server asks PayOS for the link status. This works where
  PayOS cannot reach the server (local development).

Cancelled, expired or failed links become `failed` (`gatewayResponseCode` = PayOS status,
`CANCELLED` shown as cancelled). Partly paid links (`UNDERPAID`) are not credited.

### Configuration (`server/.env`)

| Variable | Meaning |
|---|---|
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Keys of the PayOS payment channel (https://my.payos.vn). Missing → `503 PAYMENT_GATEWAY_NOT_CONFIGURED` |
| `PAYOS_RETURN_URL` | Frontend page PayOS redirects to after paying or cancelling, default `http://localhost:5173/wallet/topup/payos-result` |

Webhook URL to confirm in the PayOS dashboard: `https://<public host>/api/v1/payments/payos-webhook`.

### 5. Start a PayOS top-up
- **Method / Path**: `POST /api/v1/payments/topup/payos`
- **Auth**: User token
- **Body**: `{ "amount": 100000 }` — same limits as VNPay (10,000 – 100,000,000 VND)
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

### 6. PayOS return result
- **Method / Path**: `GET /api/v1/payments/payos-return?orderCode=1763600000123` (PayOS also adds `code`, `id`, `cancel`, `status`, ignored)
- **Auth**: User token, owner of the payment (others get `status: not_found`)
- **Response (`200 OK`)**: same shape as the VNPay return; `status` is `success` | `pending` (transfer not arrived yet — the page checks again) | `cancelled` | `failed` | `not_found`.

### 7. PayOS webhook
- **Method / Path**: `POST /api/v1/payments/payos-webhook`
- **Auth**: none; the SDK checks the signature. Wrong signature → `400 INVALID_WEBHOOK_SIGNATURE`; otherwise always `200 { success: true, data: { received: true } }` (unknown orders, the confirmation test webhook and amount mismatches are ignored).
