import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Camera, CircleCheck, Circle, Clock3, Mail, Phone, ShieldAlert, ShieldCheck, ShieldX, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../toy-listings/toy-listing-schema'
import { getProfileErrorMessage, uploadAvatar, type LatestVerification, type UserProfile, type VerificationStatus } from '../profile-api'
import { profileQuery } from '../profile-queries'

const STATUS_META: Record<VerificationStatus, { label: string; icon: LucideIcon; tone: string }> = {
  unverified: { label: 'Chưa xác minh', icon: ShieldAlert, tone: 'neutral' },
  pending: { label: 'Đang chờ duyệt', icon: Clock3, tone: 'pending' },
  verified: { label: 'Đã xác minh', icon: ShieldCheck, tone: 'verified' },
  rejected: { label: 'Bị từ chối', icon: ShieldX, tone: 'rejected' },
}

/** Lời nhắc dưới tên, theo trạng thái xác minh danh tính */
function verificationNote(status: VerificationStatus, latest: LatestVerification | null | undefined): string | null {
  if (status === 'unverified') return 'Xác minh danh tính (CCCD) để đăng đồ chơi, thuê và thanh toán.'
  if (status === 'pending') return 'Hồ sơ CCCD của bạn đang được duyệt. Kết quả sẽ hiện tại đây.'
  if (status === 'rejected') {
    return latest?.rejectionReason
      ? `Hồ sơ CCCD bị từ chối: ${latest.rejectionReason}. Hãy chụp lại ảnh rõ nét và gửi lại.`
      : 'Hồ sơ CCCD bị từ chối. Hãy chụp lại ảnh rõ nét và gửi lại.'
  }
  return null
}

/** Chữ cái đầu của họ tên làm ảnh đại diện tạm khi chưa tải ảnh */
function initialOf(fullName: string): string {
  return fullName.trim().charAt(0).toUpperCase() || '?'
}

/** Các mục hoàn thiện hồ sơ, đều suy ra từ dữ liệu backend trả về */
function completionItems(profile: UserProfile) {
  return [
    { label: 'Ảnh đại diện', done: Boolean(profile.avatarUrl) },
    { label: 'Số điện thoại', done: Boolean(profile.phone) },
    { label: 'Email', done: Boolean(profile.email) },
    { label: 'Địa chỉ nhận hàng', done: Boolean(profile.address) },
    { label: 'Xác minh danh tính', done: profile.verificationStatus === 'verified' },
  ]
}

interface ProfileHeroProps {
  profile: UserProfile
  latestVerification: LatestVerification | null | undefined
  onAvatarSaved: () => void
}

export function ProfileHero({ profile, latestVerification, onAvatarSaved }: ProfileHeroProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (avatarUrl) => {
      queryClient.setQueryData(profileQuery.queryKey, (current) => (current ? { ...current, avatarUrl } : current))
      onAvatarSaved()
    },
  })

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // cho phép chọn lại cùng một file sau khi lỗi
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setLocalError(`"${file.name}" không phải ảnh JPG, PNG hoặc WebP.`)
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLocalError(`"${file.name}" lớn hơn 5 MB. Hãy chọn ảnh nhỏ hơn.`)
      return
    }
    setLocalError(null)
    avatarMutation.mutate(file)
  }

  const status = STATUS_META[profile.verificationStatus]
  const StatusIcon = status.icon
  const note = verificationNote(profile.verificationStatus, latestVerification)
  const items = completionItems(profile)
  const percent = Math.round((items.filter((item) => item.done).length / items.length) * 100)
  const avatarError = localError ?? (avatarMutation.error ? getProfileErrorMessage(avatarMutation.error) : null)

  return (
    <section className="profile-hero" aria-label="Tổng quan hồ sơ">
      <div className="profile-hero__band" aria-hidden />

      <div className="profile-hero__body">
        <div className="profile-hero__identity">
          <div className="profile-avatar">
            <div className={`profile-avatar__frame ${avatarMutation.isPending ? 'is-busy' : ''}`}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={`Ảnh đại diện của ${profile.fullName}`} className="profile-avatar__image" />
              ) : (
                <span className="profile-avatar__initial" aria-hidden>
                  {initialOf(profile.fullName)}
                </span>
              )}
            </div>
            <input
              ref={inputRef}
              id="profile-avatar-input"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              onChange={handleFile}
              disabled={avatarMutation.isPending}
            />
            <button
              type="button"
              className="profile-avatar__change"
              onClick={() => inputRef.current?.click()}
              disabled={avatarMutation.isPending}
              aria-label={profile.avatarUrl ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
              title={profile.avatarUrl ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
            >
              <Camera aria-hidden />
            </button>
          </div>

          <div className="profile-hero__text">
            <div className="profile-hero__name-row">
              <h2 className="profile-hero__name">{profile.fullName}</h2>
              <span className={`profile-status profile-status--${status.tone}`}>
                <StatusIcon aria-hidden />
                {status.label}
              </span>
            </div>

            <ul className="profile-hero__contacts">
              <li>
                <Phone aria-hidden />
                <span className="tabular-nums">{profile.phone}</span>
              </li>
              <li className="min-w-0">
                <Mail aria-hidden />
                <span className="truncate">{profile.email}</span>
              </li>
            </ul>

            {note && (
              <p className={`profile-hero__note profile-hero__note--${status.tone}`} role={profile.verificationStatus === 'rejected' ? 'alert' : undefined}>
                <StatusIcon aria-hidden />
                <span>{note}</span>
              </p>
            )}

            {(profile.verificationStatus === 'unverified' || profile.verificationStatus === 'rejected') && (
              <Link to={PATHS.identityVerification} className="tf-btn tf-btn--primary tf-btn--inline profile-hero__verify">
                {profile.verificationStatus === 'rejected' ? 'Gửi lại hồ sơ xác minh' : 'Xác minh danh tính'}
                <ArrowRight aria-hidden />
              </Link>
            )}

            {avatarMutation.isPending && <p className="profile-hero__avatar-msg">Đang tải ảnh đại diện lên...</p>}
            {avatarError && (
              <p className="profile-hero__avatar-msg is-error" role="alert">
                {avatarError}
              </p>
            )}
          </div>
        </div>

        <aside className="profile-completion" aria-label="Mức hoàn thiện hồ sơ">
          <div className="profile-completion__head">
            <span className="profile-completion__title">Hoàn thiện hồ sơ</span>
            <span className="profile-completion__value">{percent}%</span>
          </div>
          <div className="profile-completion__track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Hoàn thiện hồ sơ">
            <span className="profile-completion__bar" style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
          <ul className="profile-completion__list">
            {items.map((item) => (
              <li key={item.label} className={item.done ? 'is-done' : undefined}>
                {item.done ? <CircleCheck aria-hidden /> : <Circle aria-hidden />}
                <span>{item.label}</span>
                <span className="sr-only">{item.done ? '(đã có)' : '(chưa có)'}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}
