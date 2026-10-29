# Frontend — Hệ thống môi giới cho thuê trò chơi

React + TypeScript + Vite.

## Chạy dự án

```bash
npm install
npm run dev
```

Lệnh khác: `npm run build`, `npm run lint`, `npm run preview`.

## Kiểm thử (Tests)

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
  chạy". Hook hoặc trang đọc URL thì bọc `MemoryRouter` / `createMemoryRouter`.
- **Không gọi mạng:** mock ở mức module — `vi.mock('../api')` (api của feature) hoặc
  `vi.mock('../services/http')`; mỗi test tự quyết server trả gì. Không cần backend chạy.
- **Kiểm hành vi người dùng thấy:** tìm phần tử theo role/label/text, thao tác bằng `userEvent`;
  không kiểm class nội bộ hay snapshot.
- `src/utils/text.test.ts` so `normalizeText` với bản của server (`server/src/utils/text.ts`) để
  form và server chuẩn hoá giống nhau.

