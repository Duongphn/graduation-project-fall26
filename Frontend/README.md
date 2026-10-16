# Frontend — ToyFlow

React 19 + TypeScript + Vite, Ant Design 6, Tailwind CSS 4, TanStack Query, axios,
react-hook-form + zod, react-router 7, dayjs.

## Chạy dự án

```bash
npm install
copy .env.example .env.local   # VITE_API_URL; VITE_DEV_USER_ID/ROLE khi chưa có đăng nhập
npm run dev
```

Lệnh khác: `npm run build`, `npm run lint`, `npm run preview`.

## Quy ước

**Code:** không dấu chấm phẩy, `import type` cho kiểu, không dùng `enum` (dùng mảng `as const`).

**Dùng thư viện đã cài, không tự viết lại:**
- Ant Design cho component giao diện (Table, Form, Modal, Upload, Tag…), Tailwind cho bố cục.
- TanStack Query cho mọi lời gọi API; mutation đi qua `useApiMutation`.
- react-hook-form + zod cho form (`FormField`, `FormModal`).
- dayjs: import từ `src/utils/dayjs.ts` (locale `vi` và plugin chỉ khai báo ở đây).
- `@ant-design/icons` hoặc `lucide-react` cho icon.

**Màu:** chỉ khai báo trong `src/styles/palette.ts`. Ant Design đọc qua `src/styles/theme.ts`,
Tailwind đọc qua biến `--tf-*` trong `src/index.css` (`bg-primary`, `text-muted`,
`border-border`…). Không viết mã màu trong component.

**Giá trị và trạng thái (một nguồn duy nhất):**

| Nội dung | Vị trí |
|---|---|
| Danh sách giá trị mirror từ backend (`toyStatuses`, `listingTypes`, `ageGroups`, `donationStatuses`…) | `src/constants/domain.ts` |
| Nhãn tiếng Việt của giá trị không phải trạng thái (`listingTypeLabels`, `ageGroupLabels`, `actorTypeLabels`, `handoverStepLabels`…) | `src/constants/labels.ts` |
| Tuổi tối thiểu GB-07 (`USER_MIN_AGE_YEARS`): chỉ dùng khi API không trả `minAgeYears` | `src/constants/domain.ts` |
| 34 tỉnh/thành (từ 01/07/2025) | `src/constants/provinces.ts` |
| Nhãn và màu trạng thái theo domain (`toy`, `identity`, `donation`, `visibility`…), màu loại tin (`listingTypeColors`) | `src/styles/status.ts` |
| Rule form dùng chung (`reasonSchema` 5–500, `phoneSchema`, `provinceSchema`) | `src/schemas/common.ts` |
| Rule đọc bộ lọc từ URL (`enumParam`, `searchParam`, `objectIdParam`, không bao giờ ném lỗi) | `src/schemas/list-params.ts` |
| Đường dẫn trang admin (`adminPaths`, `adminHomeCrumb`) | `src/routes/paths.ts` |

Hiển thị trạng thái: `<StatusTag domain="toy" status={toy.status} />`; lọc theo trạng thái:
`<StatusTabs domain="donation" value={…} onChange={…} counts={…} />`. Không khai báo lại mảng
trạng thái hay nhãn trong feature.

**Component dùng lại** (`src/components/common`, import từ `components/common`):

| Component | Dùng cho |
|---|---|
| `PageHeader` | Tiêu đề trang, breadcrumb, nút hành động |
| `FilterBar` | Hàng bộ lọc trên danh sách |
| `DataTable` | Bảng phân trang theo envelope của backend; `onRowOpen` mở dòng bằng một click hoặc Enter |
| `QueryErrorAlert` | Thông báo lỗi của query (có nút thử lại) |
| `StatusTag`, `StatusTabs` | Trạng thái theo domain |
| `FormModal`, `FormField` | Form react-hook-form trong modal |
| `ReasonModal`, `ReasonInput` | Nhập lý do (từ chối, ẩn…), có `presets` và `presetMode` `replace`/`append` |
| `Thumbnail` | Ảnh vuông có placeholder (ảnh đồ chơi, logo) |
| `ImageGallery` | Bộ ảnh xem phóng to |
| `ImageUploader` | Tải ảnh lên Cloudinary bằng chữ ký từ backend (`purpose`) |
| `ProvinceSelect` | Chọn tỉnh/thành, tìm không dấu |
| `RelativeTime` | "3 giờ trước" kèm thời gian chính xác |
| `ListingTypeTag` | Loại tin (Cho thuê / Bán lại / Tặng) có màu |
| `UserSummary` | Tên, liên hệ đã che, tag xác minh/tài khoản của một người dùng; `variant` `cell`/`card`; một trạng thái "Không tìm thấy tài khoản" |
| `AgeTag` | Tuổi kèm cảnh báo dưới tuổi tối thiểu (`minAgeYears` từ API nếu có) |

Component nào dùng được ở hơn một nơi thì tách thành file riêng trong thư mục này. Danh sách lý
do mẫu của từng feature là nội dung, đặt trong `constants.ts` của feature.

**Gọi API:**
- `src/services/http.ts`: `apiGet`, `apiGetPage`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`
  (tự bóc envelope `{ success, data }`). Cần giữ `message` của backend cho toast thì dùng
  `apiSendWithMessage(method, url, body)` (trả `WithMessage<T>` trong `src/types/api.ts`); câu
  dự phòng khi backend không gửi `message` đặt trong `hooks.ts`. Không gọi `http` trực tiếp. Lỗi được ném ra dưới dạng `ApiError` (`code`, `message`,
  `fieldErrors`).
- `getErrorMessage(error)` (`src/services/api-error.ts`) lấy thông báo để hiển thị.
- Lỗi theo trường từ backend: `useServerFieldErrors(setError)` (hoặc `applyServerFieldErrors`).
- Tải ảnh: `src/services/upload.ts` (`uploadImage(file, purpose)`); không dùng upload preset
  không ký.
- Kiểu envelope: `src/types/api.ts`.

**Hooks:**
- `useListParams({ schema, sortFields })`: trang, số dòng, sắp xếp và bộ lọc nằm trên URL. `schema`
  là `z.object` bộ lọc của feature (`xxxFiltersSchema` trong `schemas.ts`, dựng từ
  `schemas/list-params.ts`), nên `filters` đã đúng kiểu, không cần ép kiểu; `sortFields` là enum
  `sortBy` của list đó. `params` truyền thẳng vào api và query key. Ô tìm kiếm luôn dùng khoá `q`
  và có `key={q ?? ''}` để reset khi URL đổi.
- `useApiMutation({ mutationFn, successMessage, invalidate, invalidateOnConflict, onError })`:
  thông báo thành công, làm mới cache, thông báo lỗi của backend. `invalidateOnConflict: true`
  làm mới các key `invalidate` cả khi backend trả 409 (người khác đã xử lý trước).

**Cấu trúc một feature** (`src/features/<feature>/`):

| File / thư mục | Nội dung |
|---|---|
| `api.ts` | Một object `xxxApi` (`categoriesApi.list`, `.create`…) gọi API |
| `hooks.ts` | Query (query key factory `xxxKeys`, gốc là tên feature: `['donation-requests']`) và mutation |
| `types.ts` | Kiểu dữ liệu trả về |
| `schemas.ts` | Schema zod của form và bộ lọc URL |
| `constants.ts` | Nội dung riêng (lý do mẫu…) |
| `components/` | Component riêng của feature |
| `pages/` | Các trang |

**Trang admin:** thêm đường dẫn vào `adminPaths` (`src/routes/paths.ts`), một khối vào
`src/routes/admin-routes.tsx` bằng `lazyPage(() => import('…/pages/XxxPage'), 'XxxPage')` và một
dòng vào `src/routes/admin-menu.tsx`. Link và `navigate` dùng `adminPaths`, không viết chuỗi
`'/admin/...'`. Mỗi trang có breadcrumb bắt đầu bằng `adminHomeCrumb`; cột nút của bảng tên là
`'Thao tác'`. Lý do mẫu không có dấu chấm cuối; placeholder ô tìm kiếm bắt đầu bằng "Tìm theo…".

**Chưa có đăng nhập:** đặt `VITE_DEV_USER_ID` và `VITE_DEV_ROLE=ADMIN` trong `.env.local`.
Backend chỉ nhận hai header này khi chạy với `ALLOW_DEV_AUTH=true` và không phải production.
