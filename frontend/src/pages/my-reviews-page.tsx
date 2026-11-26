import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ChevronRight, Home, Star } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert } from '../components/common'
import { profileQuery } from '../features/profile/profile-queries'
import { ReviewItem, ReviewListSkeleton } from '../features/reviews/components/review-item'
import { REVIEWS_PAGE_SIZE, userReviewsQuery, type ReceivedRole } from '../features/reviews/reviews-api'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

const ROLE_TABS: { key: ReceivedRole | undefined; label: string }[] = [
  { key: undefined, label: 'Tất cả' },
  { key: 'owner', label: 'Khi cho thuê' },
  { key: 'renter', label: 'Khi đi thuê' },
]

/** Nhãn vai của người viết: đánh giá nhận khi cho thuê là do người thuê viết, và ngược lại */
const WRITER_ROLE = { RENTER_TO_OWNER: 'Người thuê', OWNER_TO_RENTER: 'Chủ đồ' } as const

const parseRole = (value: string | null): ReceivedRole | undefined =>
  value === 'owner' || value === 'renter' ? value : undefined

const parsePage = (value: string | null) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** Đánh giá người khác để lại cho mình sau các đơn thuê (GET /users/:id/reviews), lọc theo vai */
export function MyReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const role = parseRole(searchParams.get('role'))
  const page = parsePage(searchParams.get('page'))
  const profile = useQuery(profileQuery)
  const userId = profile.data?.id ?? ''
  const list = useQuery({ ...userReviewsQuery(userId, role, page), enabled: Boolean(userId) })

  useEffect(() => {
    document.title = 'Đánh giá nhận được | ToyFlow'
  }, [])

  const setFilter = (next: { role?: ReceivedRole; page?: number }) => {
    const params = new URLSearchParams()
    if (next.role) params.set('role', next.role)
    if (next.page && next.page > 1) params.set('page', String(next.page))
    setSearchParams(params, { replace: true })
  }

  const error = profile.error ?? list.error
  const total = list.data?.total ?? 0

  return (
    <SiteLayout>
      <div className="home-container reviews-page">
        <nav aria-label="Breadcrumb" className="reviews-page__crumbs">
          <Link to={PATHS.home}>
            <Home aria-hidden /> Trang chủ
          </Link>
          <ChevronRight aria-hidden />
          <span aria-current="page">Đánh giá nhận được</span>
        </nav>

        <header className="reviews-page__head">
          <p className="reviews-page__eyebrow">
            <Star aria-hidden /> Uy tín của bạn
          </p>
          <h1 className="reviews-page__title">Đánh giá nhận được</h1>
          <p className="reviews-page__lead">
            Những gì người thuê và chủ đồ nói về bạn sau mỗi đơn thuê hoàn tất.
          </p>
        </header>

        <div className="reviews-page__tabs" role="tablist" aria-label="Lọc theo vai trò">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={role === tab.key}
              className={`reviews-page__tab ${role === tab.key ? 'is-active' : ''}`}
              onClick={() => setFilter({ role: tab.key })}
            >
              {tab.label}
              {role === tab.key && list.data && <span className="reviews-page__tab-count">{total}</span>}
            </button>
          ))}
        </div>

        {error ? (
          <QueryErrorAlert error={error} onRetry={() => void (profile.isError ? profile.refetch() : list.refetch())} />
        ) : !list.data ? (
          <ReviewListSkeleton rows={4} />
        ) : list.data.items.length === 0 ? (
          <div className="reviews-page__empty">
            <p className="reviews-page__empty-title">Chưa có đánh giá nào</p>
            <p>
              Sau khi một đơn thuê hoàn tất, bên kia có 14 ngày để đánh giá bạn. Giao nhận đúng hẹn và giữ gìn đồ chơi là
              cách nhanh nhất để có đánh giá tốt.
            </p>
            <Link to={PATHS.myRentals} className="reviews-page__empty-link">
              Xem đơn thuê của tôi <ChevronRight aria-hidden />
            </Link>
          </div>
        ) : (
          <>
            <ul className="review-list" aria-busy={list.isPlaceholderData}>
              {list.data.items.map((review, index) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  index={index}
                  roleLabel={WRITER_ROLE[review.direction]}
                />
              ))}
            </ul>
            {total > REVIEWS_PAGE_SIZE && (
              <Pagination
                className="review-pagination"
                current={page}
                pageSize={REVIEWS_PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={(next) => setFilter({ role, page: next })}
              />
            )}
          </>
        )}
      </div>
    </SiteLayout>
  )
}
