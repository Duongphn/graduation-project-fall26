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

## Kiểm thử

```bash
npm test             # chạy một lần (vitest run) — chạy trước khi đẩy code
npm run test:watch   # chạy lại khi sửa file
```

Vitest + jsdom + Testing Library (`@testing-library/react`, `user-event`, `jest-dom`). Cấu hình
ở `vitest.config.ts` (dùng chung plugin của `vite.config.ts`, `css: false`), setup ở
`src/test/setup.ts` (matcher jest-dom, `matchMedia`/`ResizeObserver` cho antd).

- **Vị trí:** file `*.test.ts(x)` đặt cạnh file được kiểm thử (`useListParams.test.tsx` cạnh
  `useListParams.ts`). Test không nằm trong bản build: `tsconfig.app.json` loại chúng ra,
  `tsconfig.test.json` kiểm tra kiểu riêng (`npx tsc -b` vẫn kiểm cả hai).
- **Provider:** dùng `renderWithProviders` / `renderHookWithProviders` trong `src/test/render.tsx`
  (QueryClient mới mỗi test, không retry, kèm antd `App`); `deferred()` để giữ một request "đang
  chạy". Hook đọc URL thì bọc `MemoryRouter`.
- **Không gọi mạng:** mock ở mức module — `vi.mock('../api')` (api của feature) hoặc
  `vi.mock('../services/http')`; mỗi test tự quyết server trả gì. Không cần backend chạy.
- **Kiểm hành vi người dùng thấy:** tìm phần tử theo role/label/text, thao tác bằng `userEvent`;
  không kiểm class nội bộ hay snapshot.
- **Bảng màu:** `src/styles/palette.test.ts` so `--tf-*` trong `src/index.css` (`:root`/`.dark`)
  với `styles/palette.ts`; đổi màu ở một nơi mà quên nơi kia thì test báo lỗi.
- `src/utils/text.test.ts` so `normalizeText` với bản của server
  (`server/src/shared/utils/text.ts`) để form và server chuẩn hoá giống nhau.

## Quy ước

**Code:** không dấu chấm phẩy, `import type` cho kiểu, không dùng `enum` (dùng mảng `as const`).

**Dùng thư viện đã cài, không tự viết lại:**
- Ant Design cho component giao diện (Table, Form, Modal, Upload, Tag…), Tailwind cho bố cục.
- TanStack Query cho mọi lời gọi API; mutation đi qua `useApiMutation`.
- react-hook-form + zod cho form (`FormField`, `FormModal`).
- dayjs: import từ `src/utils/dayjs.ts` (locale `vi` và plugin chỉ khai báo ở đây).
- `@ant-design/icons` hoặc `lucide-react` cho icon.

**Giao diện và màu (một hệ duy nhất, light + dark):**
- Bảng màu duy nhất: `src/styles/palette.ts` (`palettes.light`, `palettes.dark`): navy `#24338a`,
  font Be Vietnam Pro, bo góc 12.
- Ant Design: `src/styles/theme.ts` dựng `lightTheme`/`darkTheme` từ palette;
  `ThemeProvider` (`src/contexts/theme-provider.tsx`) là `ConfigProvider` duy nhất của app, chọn
  light/dark (nút `ThemeToggle`) và bọc `<App>` của antd (cho `App.useApp()`).
- Khu admin chỉ thêm token Sider/Menu (`adminComponentTokens(isDark)`), không đặt lại màu khác.
- Tailwind: biến `--tf-*` khai báo tĩnh trong `src/index.css` (`:root` = light, `.dark` = dark),
  cùng giá trị với palette.ts (đổi màu thì sửa cả hai); dùng `bg-primary`, `text-muted`,
  `border-border`… Token `brand-*`/`night-*` trong `@theme` dùng cùng mã màu.
- Không viết mã màu trong component.

**Thư mục component:** `src/components/ui` = khung app (sidebar, logo, theme toggle…);
`src/components/common` = khối dữ liệu/form dùng lại (bảng, bộ lọc, form modal…).

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
| `DataTable` | Bảng phân trang theo envelope của backend; `onRowOpen` mở dòng bằng một click hoặc Enter; lỗi khi tải lại nền vẫn giữ dữ liệu cũ và hiện cảnh báo phía trên |
| `QueryErrorAlert` | Thông báo lỗi của query (có nút thử lại) |
| `StatusTag`, `StatusTabs` | Trạng thái theo domain |
| `FormModal`, `FormField` | Form react-hook-form trong modal; không đóng được khi đang lưu; `okDisabled` (vd. form sửa chưa đổi gì; chỉ gửi trường đã đổi) |
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
- Một axios instance duy nhất: `httpClient` (`src/services/http-client.ts`). Nó gắn
  `Authorization: Bearer` khi đã đăng nhập; khi dev và chưa đăng nhập thì gắn header dev-auth
  (`VITE_DEV_USER_ID`/`VITE_DEV_ROLE`). Lỗi gọi trực tiếp `httpClient` là `AxiosError`.
- `src/services/http.ts`: `apiGet`, `apiGetPage`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`
  là lớp mỏng trên `httpClient` (tự bóc envelope `{ success, data }` và ném `ApiError` với
  `code`, `message`, `fieldErrors`). Cần giữ `message` của backend cho toast thì dùng
  `apiSendWithMessage(method, url, body)` (trả `WithMessage<T>`); câu dự phòng đặt trong `hooks.ts`.
- Thông báo lỗi: `getApiErrorMessage`/`getApiErrorCode` (http-client.ts) nhận cả `AxiosError` lẫn
  `ApiError`; `getErrorMessage(error)` (`src/services/api-error.ts`) cho `ApiError`.
- Lỗi theo trường từ backend: `useServerFieldErrors(setError)` (hoặc `applyServerFieldErrors`).
- Tải ảnh: `src/services/upload.ts` (`uploadImage(file, purpose)`); không dùng upload preset
  không ký.
- Kiểu envelope (`ApiResponse` khai báo một lần), `MAX_PAGE_LIMIT` (100): `src/types/api.ts`.

**Hooks:**
- `useListParams({ schema, sortFields })`: trang, số dòng (tối đa `MAX_PAGE_LIMIT`), sắp xếp và bộ lọc nằm trên URL. `schema`
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
`'/admin/...'`. Khối route `/admin` nằm ở `src/routes/admin-route.tsx`: loader chỉ cho
ADMIN đã đăng nhập (role đọc từ access token, khi dev thì từ `VITE_DEV_ROLE`), còn lại chuyển
về trang đăng nhập. Menu dùng `<Link>` (mở tab mới được). Mỗi trang có breadcrumb bắt đầu bằng `adminHomeCrumb`; cột nút của bảng tên là
`'Thao tác'`. Lý do mẫu không có dấu chấm cuối; placeholder ô tìm kiếm bắt đầu bằng "Tìm theo…".

**Chưa có đăng nhập:** đặt `VITE_DEV_USER_ID` và `VITE_DEV_ROLE=ADMIN` trong `.env.local`.
Backend chỉ nhận hai header này khi chạy với `ALLOW_DEV_AUTH=true` và không phải production.
`VITE_DEV_ROLE` chỉ để frontend mở/ẩn `/admin`; backend bỏ qua header role và đọc role của
`VITE_DEV_USER_ID` trong collection `users`. Hai giá trị phải khớp: user đó phải có role ADMIN
trong database, nếu không `/admin` vẫn mở nhưng mọi API admin trả 403. Khi chưa đăng nhập,
`/admin` chuyển về `/login?redirect=/admin/...` và đăng nhập xong quay lại đúng trang đó.
