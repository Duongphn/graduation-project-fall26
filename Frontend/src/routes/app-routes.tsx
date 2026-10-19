import { createBrowserRouter, Navigate, type LoaderFunctionArgs } from 'react-router-dom'
import { PageLoadingFallback } from '../components/ui/page-loading-fallback'
import { parseCatalogSearch } from '../features/toy-catalog/catalog-search-params'
import { toyDetailQuery, toySearchQuery } from '../features/toy-catalog/toy-catalog-queries'
import { featuredRentalsQuery, homeCategoriesQuery, resaleToysQuery } from '../features/home/home-queries'
import { parseMyListingsSearch } from '../features/toy-listings/listing-display'
import {
  categoriesQuery,
  listingCountsQuery,
  myListingQuery,
  myListingsQuery,
} from '../features/toy-listings/toy-listing-queries'
import {
  myDonationQuery,
  myDonationsQuery,
  parseMyDonationsSearch,
} from '../features/donations/donor-queries'
import {
  organizationDetailQuery,
  organizationListQuery,
  parseOrganizationSearch,
} from '../features/organizations/public-queries'
import { CharityOrganizationDetailPage } from '../pages/charity-organization-detail-page'
import { CharityOrganizationsPage } from '../pages/charity-organizations-page'
import { ForgotPasswordPage } from '../pages/forgot-password-page'
import { latestVerificationQuery, profileQuery } from '../features/profile/profile-queries'
import { IdentityVerificationPage } from '../pages/identity-verification-page'
import { HomePage } from '../pages/home-page'
import { LoginPage } from '../pages/login-page'
import { MyDonationDetailPage } from '../pages/my-donation-detail-page'
import { MyDonationsPage } from '../pages/my-donations-page'
import { MyListingsPage } from '../pages/my-listings-page'
import { ProfilePage } from '../pages/profile-page'
import { RegisterPage } from '../pages/register-page'
import { ToyDetailPage } from '../pages/toy-detail-page'
import { ToyListingEditorPage } from '../pages/toy-listing-editor-page'
import { ToySearchPage } from '../pages/toy-search-page'
import { queryClient } from '../services/query-client'
import { getAccessToken } from '../services/token-storage'
import { PATHS } from './paths'
import { adminRoute } from './router'
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

async function profileLoader() {
  await Promise.all([
    queryClient.query(profileQuery).catch(ignoreError), // GET /users/profile
    queryClient.query(latestVerificationQuery).catch(ignoreError), // GET /identity-verifications/my-latest
  ])
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

async function toySearchLoader({ request }: LoaderFunctionArgs) {
  const filters = parseCatalogSearch(new URL(request.url).searchParams)
  await Promise.all([
    queryClient.query(toySearchQuery(filters)).catch(ignoreError), // GET /toys?q=&type=&…
    queryClient.query(categoriesQuery).catch(ignoreError), // GET /categories
  ])
  return null
}

async function toyDetailLoader({ params }: LoaderFunctionArgs) {
  await queryClient.query(toyDetailQuery(params.toyId!)).catch(ignoreError) // GET /toys/:toyId
  return null
}

async function charityOrganizationsLoader({ request }: LoaderFunctionArgs) {
  const filters = parseOrganizationSearch(new URL(request.url).searchParams)
  await queryClient.query(organizationListQuery(filters)).catch(ignoreError) // GET /organizations?q=&province=&ageGroup=&page=
  return null
}

async function charityOrganizationLoader({ params }: LoaderFunctionArgs) {
  await queryClient.query(organizationDetailQuery(params.organizationId!)).catch(ignoreError) // GET /organizations/:id
  return null
}

async function myDonationsLoader({ request }: LoaderFunctionArgs) {
  if (isGuest()) return null
  const filters = parseMyDonationsSearch(new URL(request.url).searchParams)
  await queryClient.query(myDonationsQuery(filters)).catch(ignoreError) // GET /donation-requests/incoming?status=&page=
  return null
}

async function myDonationLoader({ params }: LoaderFunctionArgs) {
  if (isGuest()) return null
  await Promise.all([
    queryClient.query(myDonationQuery(params.requestId!)).catch(ignoreError), // GET /donation-requests/:id
    queryClient.query(profileQuery).catch(ignoreError), // GET /users/profile (biết mình có phải người tặng)
  ])
  return null
}

export const router = createBrowserRouter([
  { path: PATHS.home, loader: homeLoader, element: <HomePage />, HydrateFallback: PageLoadingFallback },
  { path: PATHS.login, element: <LoginPage /> },
  { path: PATHS.register, element: <RegisterPage /> },
  { path: PATHS.forgotPassword, element: <ForgotPasswordPage /> },
  {
    path: PATHS.profile,
    loader: profileLoader,
    element: <ProfilePage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.identityVerification,
    loader: profileLoader,
    element: <IdentityVerificationPage />,
    HydrateFallback: PageLoadingFallback,
  },
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
  {
    path: PATHS.toys,
    loader: toySearchLoader,
    element: <ToySearchPage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.toyDetail,
    loader: toyDetailLoader,
    element: <ToyDetailPage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.charityOrganizations,
    loader: charityOrganizationsLoader,
    element: <CharityOrganizationsPage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.charityOrganization,
    loader: charityOrganizationLoader,
    element: <CharityOrganizationDetailPage />,
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.myDonations,
    loader: myDonationsLoader,
    element: (
      <RequireAuth>
        <MyDonationsPage />
      </RequireAuth>
    ),
    HydrateFallback: PageLoadingFallback,
  },
  {
    path: PATHS.myDonation,
    loader: myDonationLoader,
    element: (
      <RequireAuth>
        <MyDonationDetailPage />
      </RequireAuth>
    ),
    HydrateFallback: PageLoadingFallback,
  },
  adminRoute,
  // Chưa có trang chủ: tạm đưa mọi đường dẫn về trang đăng nhập
  { path: '*', element: <Navigate to={PATHS.login} replace /> },
  // Trang chưa xây (danh sách đồ, chi tiết, quyên góp…) và đường dẫn sai: đưa về trang chủ
  { path: '*', element: <Navigate to={PATHS.home} replace /> },
])
