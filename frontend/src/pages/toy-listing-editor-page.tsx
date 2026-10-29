import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Home } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ToyListingForm } from '../features/toy-listings/components/toy-listing-form'
import { getListingErrorMessage, isUnauthorizedError, type ToyListing } from '../features/toy-listings/toy-listing-api'
import { displayCode } from '../features/toy-listings/listing-display'
import { categoriesQuery, MY_LISTINGS_ROOT_KEY, myListingQuery } from '../features/toy-listings/toy-listing-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS, toyListingEditPath } from '../routes/paths'

const TOAST_DURATION_MS = 4000

/** Một trang cho cả tạo mới (/listings/new) và chỉnh sửa (/listings/:toyId/edit) */
export function ToyListingEditorPage() {
  const { toyId } = useParams<{ toyId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isEdit = Boolean(toyId)
  const code = toyId ? displayCode(toyId) : undefined

  // Dữ liệu đã được loader của route tải sẵn vào cache; useQuery chỉ đọc lại và theo dõi trạng thái
  const categoriesResult = useQuery(categoriesQuery)
  const listingQuery = useQuery({ ...myListingQuery(toyId ?? ''), enabled: isEdit })
  const listing = listingQuery.data ?? undefined

  const justCreated = (location.state as { justCreated?: boolean } | null)?.justCreated === true
  const [toast, setToast] = useState<string | null>(justCreated ? 'Đăng tin thành công! Tin đang ở trạng thái chờ duyệt.' : null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    document.title = `${isEdit ? 'Chỉnh sửa tin đăng' : 'Đăng tin đồ chơi'} - ToyFlow`
  }, [isEdit])

  const handleSaved = (saved: ToyListing) => {
    // Cập nhật cache để loader của trang sửa không phải gọi lại API
    queryClient.setQueryData(myListingQuery(saved.id).queryKey, saved)
    void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_ROOT_KEY })
    if (isEdit) setToast(`Cập nhật tin thành công! Tin ${displayCode(saved.id)} đã được lưu an toàn.`)
    else navigate(toyListingEditPath(saved.id), { state: { justCreated: true } })
  }

  const loadError = categoriesResult.error ?? listingQuery.error

  return (
    <AccountLayout activeItem="listings">
      <nav aria-label="Breadcrumb" className="tf-breadcrumb">
        <Link to={PATHS.home} className="tf-breadcrumb__link">
          <Home aria-hidden /> Trang chủ
        </Link>
        <ChevronRight aria-hidden />
        <Link to={PATHS.myListings} className="tf-breadcrumb__link">
          Tin đăng của tôi
        </Link>
        <ChevronRight aria-hidden />
        <span aria-current="page" className="tf-breadcrumb__current">
          {isEdit ? `Chỉnh sửa tin đăng ${code}` : 'Đăng tin mới'}
        </span>
      </nav>

      <div className="tf-card editor-header">
        <div className="editor-header__text">
          <div className="editor-header__title-row">
            <h1 className="editor-header__title">Đăng tin đồ chơi</h1>
            <span className="tf-pill tf-pill--secondary">
              <span className="tf-pill__pulse" aria-hidden />
              Chế độ: {isEdit ? `Chỉnh sửa tin ${code}` : 'Tạo tin mới'}
            </span>
          </div>
          <p className="editor-header__lead">
            Điền thông tin chi tiết về món đồ chơi. Tin đăng sẽ được Quản trị viên kiểm duyệt để bảo đảm an toàn cho các bé.
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="tf-card load-state load-state--error" role="alert">
          <p>{getListingErrorMessage(loadError)}</p>
          {isUnauthorizedError(loadError) ? (
            <Link to={PATHS.login} state={{ from: location.pathname }} className="tf-btn tf-btn--primary tf-btn--inline">
              Đăng nhập
            </Link>
          ) : (
            <button
              type="button"
              className="tf-btn tf-btn--soft tf-btn--inline"
              onClick={() => void Promise.all([categoriesResult.refetch(), listingQuery.refetch()])}
            >
              Thử lại
            </button>
          )}
        </div>
      ) : isEdit && listingQuery.isPending ? (
        <div className="tf-card load-state">Đang tải tin đăng...</div>
      ) : isEdit && !listing ? (
        <div className="tf-card load-state">Không tìm thấy tin đăng này trong danh sách tin của bạn.</div>
      ) : listing?.listingType === 'donate' ? (
        // Tin tặng không có giá: form đăng tin (cho thuê / bán) sẽ đổi nhầm loại tin
        <div className="tf-card load-state">
          <p>Tin tặng không chỉnh sửa ở đây. Theo dõi các yêu cầu nhận đồ trong mục Quyên góp của tôi.</p>
          <Link to={PATHS.myDonations} className="tf-btn tf-btn--soft tf-btn--inline">
            Quyên góp của tôi
          </Link>
        </div>
      ) : (
        <ToyListingForm
          key={listing?.id ?? 'new'}
          listing={listing}
          categories={categoriesResult.data ?? []}
          categoriesLoading={categoriesResult.isPending}
          onSaved={handleSaved}
        />
      )}

      <div className={`tf-toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        <span className="tf-toast__icon">
          <Check aria-hidden />
        </span>
        <span className="tf-toast__text">{toast}</span>
      </div>
    </AccountLayout>
  )
}
