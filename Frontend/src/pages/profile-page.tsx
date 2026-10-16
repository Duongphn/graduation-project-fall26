import { useQuery } from '@tanstack/react-query'
import { ChevronRight, CircleCheck, Home } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PersonalInfoForm } from '../features/profile/components/personal-info-form'
import { ProfileHero } from '../features/profile/components/profile-hero'
import { ShippingAddressCard } from '../features/profile/components/shipping-address-card'
import { getProfileErrorMessage, isUnauthorizedError } from '../features/profile/profile-api'
import { latestVerificationQuery, profileQuery } from '../features/profile/profile-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'

const TOAST_DURATION_MS = 4000

export function ProfilePage() {
  const location = useLocation()
  // Đã được loader của route tải sẵn vào cache
  const profileResult = useQuery(profileQuery)
  const verificationResult = useQuery(latestVerificationQuery)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Hồ sơ của tôi - ToyFlow'
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const notify = (message: string) => () => setToast(message)
  const profile = profileResult.data

  return (
    <AccountLayout activeItem="profile">
      <nav aria-label="Breadcrumb" className="tf-breadcrumb">
        <Link to={PATHS.home} className="tf-breadcrumb__link">
          <Home aria-hidden /> Trang chủ
        </Link>
        <ChevronRight aria-hidden />
        <span aria-current="page" className="tf-breadcrumb__current">
          Hồ sơ của tôi
        </span>
      </nav>

      <header className="tf-card editor-header">
        <h1 className="editor-header__title">Hồ sơ của tôi</h1>
      </header>

      {profileResult.error ? (
        <div className="tf-card load-state load-state--error" role="alert">
          <p>{getProfileErrorMessage(profileResult.error)}</p>
          {isUnauthorizedError(profileResult.error) ? (
            <Link to={PATHS.login} state={{ from: location.pathname }} className="tf-btn tf-btn--primary tf-btn--inline">
              Đăng nhập
            </Link>
          ) : (
            <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={() => void profileResult.refetch()}>
              Thử lại
            </button>
          )}
        </div>
      ) : !profile ? (
        <div className="tf-card load-state">Đang tải hồ sơ...</div>
      ) : (
        <div className="profile-page">
          <ProfileHero profile={profile} latestVerification={verificationResult.data} onAvatarSaved={notify('Đã cập nhật ảnh đại diện.')} />
          <PersonalInfoForm profile={profile} onSaved={notify('Đã lưu thông tin cá nhân.')} />
          <ShippingAddressCard profile={profile} onSaved={notify('Đã lưu địa chỉ nhận hàng.')} />
        </div>
      )}

      <div className={`tf-toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        <span className="tf-toast__icon">
          <CircleCheck aria-hidden />
        </span>
        <span className="tf-toast__text">{toast}</span>
      </div>
    </AccountLayout>
  )
}
