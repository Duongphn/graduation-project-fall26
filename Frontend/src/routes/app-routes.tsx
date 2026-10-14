import { createBrowserRouter, Navigate, type LoaderFunctionArgs } from 'react-router-dom'
import { PageLoadingFallback } from '../components/ui/page-loading-fallback'
import { parseMyListingsSearch } from '../features/toy-listings/listing-display'
import {
  categoriesQuery,
  listingCountsQuery,
  myListingQuery,
  myListingsQuery,
} from '../features/toy-listings/toy-listing-queries'
import { ForgotPasswordPage } from '../pages/forgot-password-page'
import { LoginPage } from '../pages/login-page'
import { MyListingsPage } from '../pages/my-listings-page'
import { RegisterPage } from '../pages/register-page'
import { ToyListingEditorPage } from '../pages/toy-listing-editor-page'
import { queryClient } from '../services/query-client'
import { PATHS } from './paths'

// Lỗi vẫn được lưu trong cache query, trang tự đọc và hiển thị (vd. 401 kèm nút đăng nhập)
const ignoreError = () => undefined

/** Loader gọi API trước khi render trang và lưu kết quả vào cache react-query */
async function newListingLoader() {
  await queryClient.query(categoriesQuery).catch(ignoreError) // GET /categories
  return null
}

async function myListingsLoader({ request }: LoaderFunctionArgs) {
  const filters = parseMyListingsSearch(new URL(request.url).searchParams)
  await Promise.all([
    queryClient.query(myListingsQuery(filters)).catch(ignoreError), // GET /toys/mine?status=&page=
    queryClient.query(listingCountsQuery).catch(ignoreError), // GET /toys/mine?status=… (đếm theo trạng thái)
    queryClient.query(categoriesQuery).catch(ignoreError), // GET /categories
  ])
  return null
}

async function editListingLoader({ params }: LoaderFunctionArgs) {
  await Promise.all([
    queryClient.query(categoriesQuery).catch(ignoreError), // GET /categories
    queryClient.query(myListingQuery(params.toyId!)).catch(ignoreError), // GET /toys/mine
  ])
  return null
}

export const router = createBrowserRouter([
  { path: PATHS.login, element: <LoginPage /> },
  { path: PATHS.register, element: <RegisterPage /> },
  { path: PATHS.forgotPassword, element: <ForgotPasswordPage /> },
  {
    path: PATHS.myListings,
    loader: myListingsLoader,
    element: <MyListingsPage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.newListing,
    loader: newListingLoader,
    element: <ToyListingEditorPage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.editListing,
    loader: editListingLoader,
    element: <ToyListingEditorPage />,
    HydrateFallback: PageLoadingFallback,
  },
  // Chưa có trang chủ: tạm đưa mọi đường dẫn về trang đăng nhập
  { path: '*', element: <Navigate to={PATHS.login} replace /> },
])
