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
- **Method / Path**: `GET /api/v1/wallets/me?page=1&limit=20`
- **Auth**: User token
- **Balances**:
  - `availableBalance`: spendable now (the wallet balance). `balance` is the same value, kept for older clients.
  - `holdingBalance`: money that left the balance but is still the user's. `holdings.rentals` is the rent + deposit (`pricing.totalPayable`) of the user's rentals in `PAID`, `SHIPPING`, `IN_USE`, `RETURNING` or `DISPUTING`: paid into escrow, not settled yet. `holdings.withdrawals` is the amount of their withdrawal requests still `pending` or `approved`.
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "balance": 650000,
      "availableBalance": 650000,
      "holdingBalance": 350000,
      "holdings": { "rentals": 350000, "withdrawals": 0 },
      "currency": "VND",
      "transactions": [],
      "total": 0,
      "page": 1,
      "limit": 20
    }
  }
  ```

---

### 2. Wallet History (View Wallet Transactions)
- **Method / Path**: `GET /api/v1/wallets/me/transactions`
- **Auth**: User token
Same query and response as the lead's wallet API (branches `feature/wallet-*`), so the frontend works with either backend.

- **Query**:
  - `page` (default `1`), `limit` (default `20`, max `100`)
  - `type` (optional): `all` (default) | `credit` (money in) | `debit` (money out)
  - `kind` (optional): `reference.kind` of the posting — `rental_order`, `payment` (PayOS top-up), `withdrawal`, `admin_credit`; `all` = no filter
  - `startDate`, `endDate` (optional): ISO dates, `createdAt` range with both ends included; `startDate` after `endDate` → `400`
- **Response (`200 OK`)**: newest first; the list and its paging are inside `data`
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "6af6098da7df69a64cda6d90",
          "walletId": "6af6098da7df69a64cda6d80",
          "entryKey": "rental:6af6098da7df69a64cda6d91:pay:6af6098da7df69a64cda6d80",
          "postingKey": "rental:6af6098da7df69a64cda6d91:pay",
          "amount": 350000,
          "type": "debit",
          "reference": { "kind": "rental_order", "id": "6af6098da7df69a64cda6d91" },
          "description": "Thanh toán tiền thuê và tiền cọc",
          "createdAt": "2026-11-13T01:46:34.000Z"
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
  ```
- **Errors**: `400 VALIDATION_ERROR` (unknown `type`, bad `page` / `limit` / dates), `401 UNAUTHORIZED`.

#### Example cURL:
```bash
curl -X GET http://localhost:3000/api/v1/wallets/me \
  -H "Authorization: Bearer <USER_JWT_TOKEN>"
```

---

### 3. Request Withdrawal (UC18)
- **Method / Path**: `POST /api/v1/wallets/withdrawals`
- **Auth**: User token
- **Body**:
  ```json
  { "amount": 400000, "bankInfo": { "bankName": "Vietcombank", "accountNumber": "0123456789", "accountHolderName": "Nguyen Van A" } }
  ```
- **Rules**: `amount` integer from 50,000 to 20,000,000 VND and not above the available balance; `accountNumber` 6–25 digits; `accountHolderName` 2–100 characters, stored in capitals; one `pending` request per user.
- **Effect**: in one transaction the request is created `pending` and the amount moves from the user's wallet to escrow (`reference.kind = withdrawal`, the description shows only the last 4 digits of the account). Not enough balance → nothing is created.
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Tạo yêu cầu rút tiền thành công. Số dư ví đã được tạm giữ để xử lý.",
    "data": {
      "id": "6af6098da7df69a64cda6e10",
      "code": "WD1763519600000123",
      "userId": "6adfe1d362325b45c1aded00",
      "amount": 400000,
      "bankInfo": { "bankName": "Vietcombank", "accountNumber": "0123456789", "accountHolderName": "NGUYEN VAN A" },
      "status": "pending",
      "createdAt": "2026-11-19T02:00:00.000Z",
      "updatedAt": "2026-11-19T02:00:00.000Z"
    }
  }
  ```
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `409 INSUFFICIENT_BALANCE`, `409 PENDING_WITHDRAWAL_EXISTS`.

### 4. My Withdrawal Requests
- **Method / Path**: `GET /api/v1/wallets/withdrawals?page=1&limit=20`
- **Auth**: User token
- **Response (`200 OK`)**: newest first, `data: { items, total, page, limit, totalPages, hasNextPage, hasPrevPage }`; `status` is `pending` | `approved` | `completed` | `rejected` (with Admin `notes`).

Admin processing of withdrawal requests (approve, pay out, reject with refund) is not part of UC18.

---

### 5. Admin Manual Credit
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
| `PENDING_WITHDRAWAL_EXISTS` | 409 | The user already has a pending withdrawal request |
