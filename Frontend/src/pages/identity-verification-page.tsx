import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, CircleCheck, Clock3, Home, Phone, ShieldCheck, ShieldX } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import { IdentityImageSlot } from '../features/profile/components/identity-image-slot'
import { pickTitle } from '../features/profile/identity-image-title'
import { VerificationGuide } from '../features/profile/components/verification-guide'
import { VerificationStepper } from '../features/profile/components/verification-stepper'
import { getProfileErrorMessage, isUnauthorizedError, submitIdentityVerification } from '../features/profile/profile-api'
import { latestVerificationQuery, profileQuery } from '../features/profile/profile-queries'
import { verificationSchema, type VerificationValues } from '../features/profile/profile-schema'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'

type SlotKey = 'frontImage' | 'backImage' | 'selfie'

const SLOT_LABELS: Record<SlotKey, string> = { frontImage: 'Mặt trước', backImage: 'Mặt sau', selfie: 'Ảnh chân dung' }
const EMPTY_FILES: Record<SlotKey, File | null> = { frontImage: null, backImage: null, selfie: null }
const SELFIE_TIPS = ['Khuôn mặt ở giữa khung hình', 'Không đội mũ, đeo khẩu trang', 'Nền đơn giản, không ngược sáng']

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

interface VerifyStepProps {
  done: boolean
  title: string
  description: string
  children: ReactNode
}

/** Một mục của hồ sơ: ô tick chuyển xanh khi mục đã đủ thông tin */
function VerifyStep({ done, title, description, children }: VerifyStepProps) {
  return (
    <section className="verify-step">
      <span className={`verify-step__check ${done ? 'is-done' : ''}`} aria-hidden>
        <Check />
      </span>
      <div className="verify-step__body">
        <h3 className="verify-step__title">
          {title}
          <span className="sr-only">{done ? ' (đã xong)' : ' (chưa xong)'}</span>
        </h3>
        <p className="verify-step__desc">{description}</p>
        <div className="verify-step__content">{children}</div>
      </div>
    </section>
  )
}

export function IdentityVerificationPage() {
  const location = useLocation()
  const queryClient = useQueryClient()
  // Đã được loader của route tải sẵn vào cache
  const profileResult = useQuery(profileQuery)
  const latestResult = useQuery(latestVerificationQuery)
  const profile = profileResult.data
  const latest = latestResult.data

  const [files, setFiles] = useState(EMPTY_FILES)
  const [fileErrors, setFileErrors] = useState<Partial<Record<SlotKey, string>>>({})
  const [consented, setConsented] = useState(false)
  const [consentError, setConsentError] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<VerificationValues>({
    resolver: zodResolver(verificationSchema),
    values: { idCardNumber: '', phone: profile?.phone ?? '' },
    resetOptions: { keepDirtyValues: true },
    mode: 'onTouched',
  })
  const [phone, idCardNumber] = useWatch({ control, name: ['phone', 'idCardNumber'] })

  const submitMutation = useMutation({
    mutationFn: submitIdentityVerification,
    onSuccess: () => {
      setFiles(EMPTY_FILES)
      void queryClient.invalidateQueries({ queryKey: profileQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: latestVerificationQuery.queryKey })
    },
  })

  useEffect(() => {
    document.title = 'Xác minh danh tính - ToyFlow'
  }, [])

  const phoneDone = verificationSchema.shape.phone.safeParse(phone ?? '').success
  const idCardDone = verificationSchema.shape.idCardNumber.safeParse(idCardNumber ?? '').success && Boolean(files.frontImage && files.backImage)
  const selfieDone = Boolean(files.selfie)
  const doneCount = [phoneDone, idCardDone, selfieDone, consented].filter(Boolean).length

  const setSlotFile = (key: SlotKey) => (file: File | null, error?: string) => {
    setFiles((current) => ({ ...current, [key]: file }))
    setFileErrors((current) => ({ ...current, [key]: error }))
  }

  /** Báo thiếu ảnh và thiếu xác nhận cùng lúc với lỗi ô nhập, kể cả khi số CCCD/SĐT còn sai */
  const markMissing = () => {
    const missing = Object.fromEntries(
      (Object.keys(SLOT_LABELS) as SlotKey[]).filter((key) => !files[key]).map((key) => [key, `${pickTitle(SLOT_LABELS[key])}.`]),
    )
    setFileErrors((current) => ({ ...current, ...missing }))
    setConsentError(!consented)
  }

  const submitForm = handleSubmit((values) => {
    const { frontImage, backImage, selfie } = files
    if (!frontImage || !backImage || !selfie || !consented) return
    submitMutation.mutate({ ...values, frontImage, backImage, selfie })
  })

  const isSaving = submitMutation.isPending
  const status = profile?.verificationStatus
  const loadError = profileResult.error ?? latestResult.error

  return (
    <AccountLayout activeItem="profile">
      <nav aria-label="Breadcrumb" className="tf-breadcrumb">
        <Link to={PATHS.home} className="tf-breadcrumb__link">
          <Home aria-hidden /> Trang chủ
        </Link>
        <ChevronRight aria-hidden />
        <Link to={PATHS.profile} className="tf-breadcrumb__link">
          Hồ sơ của tôi
        </Link>
        <ChevronRight aria-hidden />
        <span aria-current="page" className="tf-breadcrumb__current">
          Xác minh danh tính
        </span>
      </nav>

      <header className="listings-header">
        <div className="listings-header__text">
          <h1 className="listings-header__title">Xác minh danh tính</h1>
          <p className="listings-header__lead">Gửi ảnh CCCD và ảnh chân dung để được đăng đồ chơi, thuê và thanh toán trên ToyFlow.</p>
        </div>
      </header>

      {loadError ? (
        <div className="tf-card load-state load-state--error" role="alert">
          <p>{getProfileErrorMessage(loadError)}</p>
          {isUnauthorizedError(loadError) ? (
            <Link to={PATHS.login} state={{ from: location.pathname }} className="tf-btn tf-btn--primary tf-btn--inline">
              Đăng nhập
            </Link>
          ) : (
            <button
              type="button"
              className="tf-btn tf-btn--soft tf-btn--inline"
              onClick={() => void Promise.all([profileResult.refetch(), latestResult.refetch()])}
            >
              Thử lại
            </button>
          )}
        </div>
      ) : !profile || !status || latestResult.isPending ? (
        <div className="tf-card load-state">Đang tải trạng thái xác minh...</div>
      ) : (
        <div className="profile-page">
          <VerificationStepper status={status} />

          {status === 'verified' ? (
            <div className="tf-card verify-result verify-result--verified">
              <ShieldCheck aria-hidden />
              <p className="verify-result__title">Tài khoản đã được xác minh</p>
              <p className="verify-result__text">Bạn có thể đăng đồ chơi, thuê và thanh toán. Không cần gửi lại hồ sơ.</p>
              <Link to={PATHS.profile} className="tf-btn tf-btn--soft tf-btn--inline">
                Về hồ sơ của tôi
              </Link>
            </div>
          ) : status === 'pending' ? (
            <div className="tf-card verify-result verify-result--pending" role="status">
              <Clock3 aria-hidden />
              <p className="verify-result__title">Hồ sơ đang chờ duyệt</p>
              <p className="verify-result__text">
                {latest ? `Đã gửi lúc ${formatDateTime(latest.submittedAt)}. ` : ''}Kết quả sẽ hiện trên trang hồ sơ của bạn.
              </p>
              <Link to={PATHS.profile} className="tf-btn tf-btn--soft tf-btn--inline">
                Về hồ sơ của tôi
              </Link>
            </div>
          ) : (
            <div className="verify-layout">
              <form
                className="tf-card verify-form"
                onSubmit={(event) => {
                  markMissing()
                  void submitForm(event)
                }}
                noValidate
              >
                <h2 className="verify-form__title">Hồ sơ xác minh</h2>

                {status === 'rejected' && (
                  <p className="profile-hero__note profile-hero__note--rejected" role="alert">
                    <ShieldX aria-hidden />
                    <span>
                      Hồ sơ trước bị từ chối{latest?.rejectionReason ? `: ${latest.rejectionReason}` : ''}. Hãy chụp lại ảnh rõ nét và gửi lại.
                    </span>
                  </p>
                )}

                <VerifyStep done={phoneDone} title="Số điện thoại liên hệ" description="Quản trị viên dùng số này để liên hệ khi cần trong lúc duyệt hồ sơ.">
                  <div className="tf-field verify-form__narrow">
                    <label htmlFor="verify-phone" className="sr-only">
                      Số điện thoại liên hệ
                    </label>
                    <div className="verify-input-icon">
                      <Phone aria-hidden />
                      <input
                        id="verify-phone"
                        className={`tf-input tabular-nums ${errors.phone ? 'is-invalid' : ''}`}
                        inputMode="tel"
                        autoComplete="tel"
                        aria-invalid={Boolean(errors.phone)}
                        disabled={isSaving}
                        {...register('phone')}
                      />
                    </div>
                    {errors.phone && <p className="tf-field-error">{errors.phone.message}</p>}
                  </div>
                </VerifyStep>

                <VerifyStep done={idCardDone} title="Ảnh căn cước công dân (2 mặt)" description="CCCD gắn chip hoặc CMND còn hạn. JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh.">
                  <div className="tf-field verify-form__narrow">
                    <label htmlFor="verify-id-card" className="tf-label">
                      Số CCCD/CMND
                    </label>
                    <input
                      id="verify-id-card"
                      className={`tf-input tabular-nums ${errors.idCardNumber ? 'is-invalid' : ''}`}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="12 chữ số trên thẻ"
                      aria-invalid={Boolean(errors.idCardNumber)}
                      disabled={isSaving}
                      {...register('idCardNumber')}
                    />
                    {errors.idCardNumber && <p className="tf-field-error">{errors.idCardNumber.message}</p>}
                  </div>
                  <div className="id-slot-grid">
                    <IdentityImageSlot
                      id="verify-frontImage"
                      label="Mặt trước"
                      hint="Mặt có ảnh và họ tên"
                      file={files.frontImage}
                      error={fileErrors.frontImage}
                      disabled={isSaving}
                      onChange={setSlotFile('frontImage')}
                    />
                    <IdentityImageSlot
                      id="verify-backImage"
                      label="Mặt sau"
                      hint="Mặt có mã QR hoặc vân tay"
                      file={files.backImage}
                      error={fileErrors.backImage}
                      disabled={isSaving}
                      onChange={setSlotFile('backImage')}
                    />
                  </div>
                </VerifyStep>

                <VerifyStep done={selfieDone} title="Ảnh chân dung" description="Chụp thẳng mặt, đủ sáng. Quản trị viên so khớp với ảnh trên CCCD.">
                  <div className="id-slot-grid">
                    <IdentityImageSlot
                      id="verify-selfie"
                      label="Ảnh chân dung"
                      hint="Chụp thẳng mặt, đủ sáng"
                      file={files.selfie}
                      error={fileErrors.selfie}
                      disabled={isSaving}
                      portrait
                      onChange={setSlotFile('selfie')}
                    />
                    <ul className="verify-selfie-tips">
                      {SELFIE_TIPS.map((tip) => (
                        <li key={tip}>
                          <Check aria-hidden />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </VerifyStep>

                <div className="verify-consent">
                  <label className="verify-consent__label">
                    <input
                      type="checkbox"
                      className="verify-consent__box"
                      checked={consented}
                      onChange={(event) => {
                        setConsented(event.target.checked)
                        if (event.target.checked) setConsentError(false)
                      }}
                      disabled={isSaving}
                      aria-invalid={consentError}
                      aria-describedby={consentError ? 'verify-consent-error' : undefined}
                    />
                    <span>Tôi xác nhận ảnh là của chính tôi và đồng ý để ToyFlow dùng các ảnh này cho việc xác minh danh tính.</span>
                  </label>
                  {consentError && (
                    <p id="verify-consent-error" className="tf-field-error">
                      Đánh dấu xác nhận để gửi hồ sơ.
                    </p>
                  )}
                </div>

                {submitMutation.error && (
                  <p className="publish-error" role="alert">
                    {getProfileErrorMessage(submitMutation.error)}
                  </p>
                )}

                <div className="verify-form__footer">
                  <span className="verify-form__progress tabular-nums">
                    {doneCount === 4 && <CircleCheck aria-hidden />}
                    Đã xong {doneCount}/4 mục
                  </span>
                  <button type="submit" className="tf-btn tf-btn--primary tf-btn--inline" disabled={isSaving}>
                    <ShieldCheck aria-hidden />
                    {isSaving ? 'Đang gửi hồ sơ...' : 'Gửi hồ sơ xác minh'}
                  </button>
                </div>
              </form>

              <VerificationGuide />
            </div>
          )}
        </div>
      )}
    </AccountLayout>
  )
}
