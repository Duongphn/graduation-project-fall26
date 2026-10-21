# Hướng Dẫn Quy Ước API ToyFlow (API Conventions & Swagger Guide)

Tài liệu này quy định các chuẩn giao tiếp HTTP RESTful cho dự án **ToyFlow Backend** (`Express 5 + TypeScript + Mongoose`), áp dụng xuyên suốt cho toàn bộ các tính năng (`auth`, `toy-catalog`, `rental-orders`, `resale-orders`, v.v.).

---

## 1. Cấu Trúc Phản Hồi Thành Công (Success Response)

Mọi API trả về thành công đều tuân theo chuẩn envelope với `success: true`.

### 1.1 Interface TypeScript
```typescript
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}
```

### 1.2 Ví dụ thực tế

#### Lấy chi tiết 1 tài nguyên (`GET /api/v1/toys/:id`) - `200 OK`:
```json
{
  "success": true,
  "data": {
    "id": "67098e1b34e12c001a123456",
    "name": "Bộ xếp hình LEGO Technic",
    "rentalPricePerDay": 25000,
    "status": "AVAILABLE",
    "createdAt": "2026-10-12T08:00:00.000Z"
  }
}
```

#### Tạo mới tài nguyên (`POST /api/v1/toys`) - `201 Created`:
```json
{
  "success": true,
  "data": {
    "id": "67098e1b34e12c001a123456"
  },
  "message": "Tạo đồ chơi mới thành công."
}
```

#### Hành động không cần trả về dữ liệu - `200 OK`:
```json
{
  "success": true,
  "data": null,
  "message": "Đã gửi email khôi phục mật khẩu."
}
```

---

## 2. Cấu Trúc Phản Hồi Lỗi (Error & Validation Response)

Tất cả các lỗi trả về mã HTTP tương ứng (`400`, `401`, `403`, `404`, `409`, `422`, `500`) và tuân thủ envelope:

### 2.1 Interface TypeScript
```typescript
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
}
```

### 2.2 Ví dụ thực tế

#### Lỗi xác thực dữ liệu đầu vào (`400 Bad Request` hoặc `422 Unprocessable Content`):
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu yêu cầu không hợp lệ.",
    "details": [
      {
        "field": "rentalPricePerDay",
        "message": "Giá thuê mỗi ngày phải lớn hơn 0."
      },
      {
        "field": "name",
        "message": "Tên đồ chơi phải có ít nhất 3 ký tự."
      }
    ]
  }
}
```

#### Lỗi nghiệp vụ (`409 Conflict`):
```json
{
  "success": false,
  "error": {
    "code": "RENTAL_CONFLICT",
    "message": "Đồ chơi đã có người đặt thuê trong khoảng thời gian đã chọn."
  }
}
```

#### Lỗi không tìm thấy tài nguyên (`404 Not Found`):
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Không tìm thấy đồ chơi với ID yêu cầu."
  }
}
```

#### Lỗi hệ thống (`500 Internal Server Error`):
*Tuyệt đối không hiển thị stack trace hay database internals ra ngoài client khi chạy production.*
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Đã có lỗi bất ngờ xảy ra từ phía máy chủ."
  }
}
```

---

## 3. Chuẩn Phân Trang (Pagination Convention)

### 3.1 Tham số truy vấn (Query Parameters)
Các endpoint danh sách hỗ trợ phân trang nhận các tham số:
- `page`: Số trang hiện tại (bắt đầu từ `1`, mặc định: `1`).
- `limit`: Số lượng mục mỗi trang (mặc định: `10`, tối đa: `100`).
- `sortBy`: Tên trường cần sắp xếp (ví dụ: `createdAt`).
- `sortOrder`: Hướng sắp xếp (`asc` hoặc `desc`, mặc định: `desc`).

### 3.2 Cấu trúc phản hồi phân trang
```typescript
export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedApiResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}
```

### 3.3 Ví dụ thực tế (`GET /api/v1/toys?page=1&limit=2`):
```json
{
  "success": true,
  "data": [
    {
      "id": "67098e1b34e12c001a123456",
      "name": "LEGO Technic Mars Rover",
      "rentalPricePerDay": 25000
    },
    {
      "id": "67098e1b34e12c001a123457",
      "name": "Bộ cờ tỷ phú Monopoly",
      "rentalPricePerDay": 15000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 2,
    "totalItems": 42,
    "totalPages": 21,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## 4. Xác Thực Dữ Liệu & Swagger / OpenAPI (Single Source of Truth)

Nhằm tránh việc tài liệu Swagger bị lỗi thời so với mã nguồn thực tế:
1. **Validation Engine:** Sử dụng thư viện `zod` để định nghĩa schema cho `body`, `query`, và `params`.
2. **OpenAPI Generator:** Sử dụng `@asteasolutions/zod-to-openapi` để tự động suy xuất OpenAPI 3.0+ từ chính các Zod schema.
3. **Swagger UI:** Tích hợp `swagger-ui-express` để cung cấp giao diện trực quan tại đường dẫn:
   - UI: `/api/docs`
   - Raw JSON Spec: `/api/docs/json`

### 4.1 Quy trình mẫu cho một Feature mới:
```typescript
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 1. Định nghĩa Zod Schema có kèm thông tin Swagger
export const CreateToySchema = z.object({
  name: z.string().min(3).openapi({ example: 'Bộ Lego Tàu Vũ Trụ' }),
  rentalPricePerDay: z.number().positive().openapi({ example: 25000 }),
});

// 2. Sử dụng Middleware kiểm tra request
toyRouter.post('/', validateRequest({ body: CreateToySchema }), handleCreateToy);

// 3. Đăng ký endpoint vào OpenAPI Registry
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/toys',
  summary: 'Tạo đồ chơi mới',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateToySchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Đã tạo đồ chơi thành công',
      content: {
        'application/json': { schema: ToyResponseSchema },
      },
    },
  },
});
```

---

## 5. Tổ Chức Thư Mục Mã Nguồn Đề Xuất

Tuân thủ kiến trúc phân tầng `config/shared/infrastructure -> features -> app`:

```text
server/src/
├── app/
│   ├── create-app.ts            # Cài đặt middleware và mount /api/docs
│   └── router.ts                # Mount các feature routers
├── infrastructure/
│   └── docs/                    # OpenAPI registry builder và Swagger UI setup
├── shared/
│   ├── errors/
│   │   └── app-error.ts         # AppError class kế thừa mã lỗi & status
│   ├── middleware/
│   │   ├── error-handler.ts     # Middleware format lỗi chuẩn
│   │   └── validate.ts          # Middleware xác thực dữ liệu qua Zod
│   └── utils/
│       └── response.ts          # Helper: sendSuccess, sendPaginated
└── features/
    └── toy-catalog/
        └── schemas/             # Zod validation schemas cho feature
```
