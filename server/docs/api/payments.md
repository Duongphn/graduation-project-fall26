# Payments — VNPay wallet top-up (UC17)

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
| `PAYMENT_EXPIRY_JOB_ENABLED`, `PAYMENT_EXPIRY_JOB_INTERVAL_MINUTES` | Job that fails top-ups still pending 15 minutes after their link expired (default on, every 5 minutes) |

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
