import { createBrowserRouter, Navigate, type LoaderFunctionArgs } from 'react-router-dom'
import { PageLoadingFallback } from '../components/ui/page-loading-fallback'
import { featuredRentalsQuery, homeCategoriesQuery, resaleToysQuery } from '../features/home/home-queries'
import { parseMyListingsSearch } from '../features/toy-listings/listing-display'
import {
  categoriesQuery,
  listingCountsQuery,
  myListingQuery,
  myListingsQuery,
} from '../features/toy-listings/toy-listing-queries'
import { ForgotPasswordPage } from '../pages/forgot-password-page'
import { HomePage } from '../pages/home-page'
import { LoginPage } from '../pages/login-page'
import { MyListingsPage } from '../pages/my-listings-page'
import { RegisterPage } from '../pages/register-page'
import { ToyListingEditorPage } from '../pages/toy-listing-editor-page'
import { queryClient } from '../services/query-client'
import { getAccessToken } from '../services/token-storage'
import { PATHS } from './paths'
import { RequireAuth } from './require-auth'

// Lỗi vẫn được lưu trong cache query, trang tự đọc và hiển thị (vd. 401 kèm nút đăng nhập)
const ignoreError = () => undefined

/** Khách chưa đăng nhập: bỏ qua gọi API (chắc chắn 401) — RequireAuth sẽ chuyển sang trang đăng nhập */
const isGuest = () => getAccessToken() === null

/** Loader gọi API trước khi render trang và lưu kết quả vào cache react-query */
async function homeLoader() {
  await Promise.all([
    queryClient.query(homeCategoriesQuery).catch(ignoreError), // GET /categories
    queryClient.infiniteQuery(featuredRentalsQuery).catch(ignoreError), // GET /toys?listingType=rent&sort=popular&page=1
    queryClient.infiniteQuery(resaleToysQuery).catch(ignoreError), // GET /toys?listingType=sell&sort=newest&page=1
  ])
  return null
}

async function newListingLoader() {
  if (isGuest()) return null
  await queryClient.query(categoriesQuery).catch(ignoreError) // GET /categories
  return null
}

async function myListingsLoader({ request }: LoaderFunctionArgs) {
  if (isGuest()) return null
  const filters = parseMyListingsSearch(new URL(request.url).searchParams)
  await Promise.all([
    queryClient.query(myListingsQuery(filters)).catch(ignoreError), // GET /toys/mine?status=&page=
    queryClient.query(listingCountsQuery).catch(ignoreError), // GET /toys/mine?status=… (đếm theo trạng thái)
    queryClient.query(categoriesQuery).catch(ignoreError), // GET /categories
  ])
  return null
}

async function editListingLoader({ params }: LoaderFunctionArgs) {
  if (isGuest()) return null
  await Promise.all([
    queryClient.query(categoriesQuery).catch(ignoreError), // GET /categories
    queryClient.query(myListingQuery(params.toyId!)).catch(ignoreError), // GET /toys/mine
  ])
  return null
}

export const router = createBrowserRouter([
  { path: PATHS.home, loader: homeLoader, element: <HomePage />, HydrateFallback: PageLoadingFallback },
  { path: PATHS.login, element: <LoginPage /> },
  { path: PATHS.register, element: <RegisterPage /> },
  { path: PATHS.forgotPassword, element: <ForgotPasswordPage /> },
  {
    path: PATHS.myListings,
    loader: myListingsLoader,
    element: (
      <RequireAuth>
        <MyListingsPage />
      </RequireAuth>
    ),
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.newListing,
    loader: newListingLoader,
    element: (
      <RequireAuth>
        <ToyListingEditorPage />
      </RequireAuth>
    ),
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.editListing,
    loader: editListingLoader,
    element: (
      <RequireAuth>
        <ToyListingEditorPage />
      </RequireAuth>
    ),
    HydrateFallback: PageLoadingFallback,
  },
  // Trang chưa xây (danh sách đồ, chi tiết, quyên góp…) và đường dẫn sai: đưa về trang chủ
  { path: '*', element: <Navigate to={PATHS.home} replace /> },
])
