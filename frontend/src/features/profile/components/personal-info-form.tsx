import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Lock, UserRound } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { getProfileErrorMessage, updateProfile, type Gender, type UserProfile } from '../profile-api'
import { profileQuery } from '../profile-queries'
import { BIO_MAX_LENGTH, personalInfoSchema, todayIsoDate, type PersonalInfoValues } from '../profile-schema'

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Nữ' },
  { value: 'male', label: 'Nam' },
  { value: 'other', label: 'Khác' },
]

/** Giá trị đã lưu → giá trị form (ô trống là '') */
const toFormValues = (profile: UserProfile): PersonalInfoValues => ({
  fullName: profile.fullName,
  dateOfBirth: profile.dateOfBirth ?? '',
  gender: profile.gender ?? '',
  bio: profile.bio ?? '',
})

interface PersonalInfoFormProps {
  profile: UserProfile
  onSaved: () => void
}

/** R03 III.6.1.1 (5)–(8): họ tên, ngày sinh, giới tính, giới thiệu; SĐT và email chỉ đọc */
export function PersonalInfoForm({ profile, onSaved }: PersonalInfoFormProps) {
  const queryClient = useQueryClient()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PersonalInfoValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: toFormValues(profile),
    mode: 'onTouched',
  })
  const bio = useWatch({ control, name: 'bio' }) ?? ''

  const saveMutation = useMutation({
    mutationFn: (values: PersonalInfoValues) =>
      updateProfile({
        fullName: values.fullName,
        dateOfBirth: values.dateOfBirth || null,
        gender: values.gender || null,
        bio: values.bio || null,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(profileQuery.queryKey, saved)
      reset(toFormValues(saved))
      onSaved()
    },
  })

  const isSaving = saveMutation.isPending

  return (
    <form className="tf-card tf-card--roomy profile-section" onSubmit={handleSubmit((values) => saveMutation.mutate(values))} noValidate>
      <div className="tf-card__head tf-card__head--wrap">
        <h2 className="tf-section-title tf-section-title--md">
          <span className="tf-section-title__icon">
            <UserRound aria-hidden />
          </span>
          Thông tin cá nhân
        </h2>
        <p className="tf-caption">Tên, ảnh và giới thiệu hiển thị cho người thuê, người mua.</p>
      </div>

      <div className="tf-field-grid">
        <div className="tf-field sm:col-span-2">
          <label htmlFor="profile-full-name" className="tf-label">
            Họ và tên <span className="tf-required">*</span>
          </label>
          <input
            id="profile-full-name"
            className={`tf-input ${errors.fullName ? 'is-invalid' : ''}`}
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'profile-full-name-error' : undefined}
            disabled={isSaving}
            {...register('fullName')}
          />
          {errors.fullName && (
            <p id="profile-full-name-error" className="tf-field-error">
              {errors.fullName.message}
            </p>
          )}
        </div>

        <div className="tf-field">
          <label htmlFor="profile-date-of-birth" className="tf-label">
            Ngày sinh
          </label>
          <input
            id="profile-date-of-birth"
            type="date"
            min="1900-01-01"
            max={todayIsoDate()}
            className={`tf-input ${errors.dateOfBirth ? 'is-invalid' : ''}`}
            autoComplete="bday"
            aria-invalid={Boolean(errors.dateOfBirth)}
            aria-describedby={errors.dateOfBirth ? 'profile-date-of-birth-error' : 'profile-date-of-birth-hint'}
            disabled={isSaving}
            {...register('dateOfBirth')}
          />
          {errors.dateOfBirth ? (
            <p id="profile-date-of-birth-error" className="tf-field-error">
              {errors.dateOfBirth.message}
            </p>
          ) : (
            <p id="profile-date-of-birth-hint" className="tf-caption">
              Chỉ hiện trên hồ sơ. Độ tuổi khi xác minh được Admin đối chiếu trên CCCD.
            </p>
          )}
        </div>

        <div className="tf-field">
          <label htmlFor="profile-gender" className="tf-label">
            Giới tính
          </label>
          <div className="tf-select">
            <select id="profile-gender" className="tf-input" disabled={isSaving} {...register('gender')}>
              <option value="">Không muốn nêu</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="tf-select__chevron" />
          </div>
        </div>

        <div className="tf-field sm:col-span-2">
          <div className="tf-field__label-row">
            <label htmlFor="profile-bio" className="tf-label">
              Giới thiệu ngắn
            </label>
            <span className={`tf-caption tabular-nums ${bio.length > BIO_MAX_LENGTH ? 'text-tf-error' : ''}`} aria-live="polite">
              {bio.length}/{BIO_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="profile-bio"
            rows={3}
            className={`tf-input tf-input--textarea ${errors.bio ? 'is-invalid' : ''}`}
            placeholder="Ví dụ: Mẹ của hai bé, thích đồ chơi gỗ và giữ đồ chơi rất cẩn thận."
            aria-invalid={Boolean(errors.bio)}
            aria-describedby={errors.bio ? 'profile-bio-error' : undefined}
            disabled={isSaving}
            {...register('bio')}
          />
          {errors.bio && (
            <p id="profile-bio-error" className="tf-field-error">
              {errors.bio.message}
            </p>
          )}
        </div>

        <div className="tf-field">
          <label htmlFor="profile-phone" className="tf-label">
            Số điện thoại
          </label>
          <div className="tf-affix-input">
            <input id="profile-phone" className="tf-input tf-input--locked tabular-nums" value={profile.phone} readOnly aria-describedby="profile-phone-hint" />
            <Lock className="tf-affix-input__icon" aria-hidden />
          </div>
          <p id="profile-phone-hint" className="tf-caption">
            Số dùng để đăng nhập, chưa đổi được tại đây.
          </p>
        </div>

        <div className="tf-field">
          <label htmlFor="profile-email" className="tf-label">
            Email
          </label>
          <div className="tf-affix-input">
            <input id="profile-email" className="tf-input tf-input--locked" value={profile.email} readOnly aria-describedby="profile-email-hint" />
            <Lock className="tf-affix-input__icon" aria-hidden />
          </div>
          <p id="profile-email-hint" className="tf-caption">
            Email nhận mã OTP, chưa đổi được tại đây.
          </p>
        </div>
      </div>

      {saveMutation.error && (
        <p className="publish-error" role="alert">
          {getProfileErrorMessage(saveMutation.error)}
        </p>
      )}

      <div className="profile-actions">
        <button
          type="button"
          className="tf-btn tf-btn--soft tf-btn--inline"
          onClick={() => {
            reset(toFormValues(profile))
            saveMutation.reset()
          }}
          disabled={!isDirty || isSaving}
        >
          Huỷ thay đổi
        </button>
        <button type="submit" className="tf-btn tf-btn--primary tf-btn--inline" disabled={!isDirty || isSaving}>
          {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  )
}
