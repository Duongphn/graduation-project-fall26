import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { getProfileErrorMessage, updateProfile, type UserProfile } from '../profile-api'
import { profileQuery } from '../profile-queries'
import { personalInfoSchema, type PersonalInfoValues } from '../profile-schema'

interface PersonalInfoFormProps {
  profile: UserProfile
  onSaved: () => void
}

export function PersonalInfoForm({ profile, onSaved }: PersonalInfoFormProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PersonalInfoValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: { fullName: profile.fullName },
    mode: 'onTouched',
  })

  const saveMutation = useMutation({
    mutationFn: (values: PersonalInfoValues) => updateProfile({ fullName: values.fullName }),
    onSuccess: (saved) => {
      queryClient.setQueryData(profileQuery.queryKey, saved)
      reset({ fullName: saved.fullName })
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
        <p className="tf-caption">Tên và ảnh hiển thị cho người thuê, người mua.</p>
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
            reset({ fullName: profile.fullName })
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
