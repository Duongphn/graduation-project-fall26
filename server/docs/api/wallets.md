# Wallets Feature Module

The `wallets` module provides APIs for the ToyFlow double-entry wallet ledger, user balance inquiry, and Admin manual credit.

---

## Double-Entry Ledger Overview

The system maintains a zero-sum double-entry ledger where the sum of all wallet balances is strictly 0:
- **User Wallets**: Each user has an internal wallet storing their available balance.
- **System Wallets**:
  - `escrow`: Holds locked rental payments and deposits until order completion or dispute ruling.
  - `platform`: Accumulates platform fees deducted from rental fees.
  - `external`: The source of external funds injected into the system (the only wallet with a negative balance).

---

## Endpoints

### 1. Get Current User's Wallet
- **Method / Path**: `GET /api/v1/wallets/me`
- **Auth**: User token
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "6adfe1d362325b45c1adecf0",
      "userId": "6adfe1d362325b45c1aded00",
      "balance": 350000,
      "currency": "VND",
      "createdAt": "2026-10-27T00:00:00.000Z",
      "updatedAt": "2026-10-27T00:00:00.000Z"
    }
  }
  ```

#### Example cURL:
```bash
curl -X GET http://localhost:3000/api/v1/wallets/me \
  -H "Authorization: Bearer <USER_JWT_TOKEN>"
```

---

### 2. Admin Manual Credit
In the absence of payment gateway top-ups (UC20), Admins can credit integer VND funds directly to a user's wallet.

- **Method / Path**: `POST /api/v1/admin/wallets/:userId/credit`
- **Auth**: Admin token (`role: 'ADMIN'`)
- **Request Body**:
  ```json
  {
    "amount": 500000,
    "note": "Manual top-up for testing"
  }
  ```
- **Validation**:
  - `amount`: positive integer between 1 and 1,000,000,000 VND.
  - `note`: optional string up to 500 characters.
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "transactionId": "6adfe1d362325b45c1adecf2",
      "postingKey": "credit:550e8400-e29b-41d4-a716-446655440000",
      "walletId": "6adfe1d362325b45c1adecf0",
      "amount": 500000,
      "balanceAfter": 500000
    }
  }
  ```

#### Example cURL:
```bash
curl -X POST http://localhost:3000/api/v1/admin/wallets/6adfe1d362325b45c1aded00/credit \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 500000, "note": "Admin top-up"}'
```

---

## Error Codes

| Error Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Amount is non-integer, <= 0, or exceeds limit (> 1,000,000,000 VND) |
| `FORBIDDEN` | 403 | Caller does not have Admin privileges |
| `USER_NOT_FOUND` | 404 | User ID specified in route does not exist |
| `INSUFFICIENT_BALANCE` | 409 | Attempting to debit an amount greater than the current wallet balance |
