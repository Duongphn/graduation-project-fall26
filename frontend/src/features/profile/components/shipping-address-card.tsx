import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { getProfileErrorMessage, updateProfile, type UserProfile } from '../profile-api'
import { profileQuery } from '../profile-queries'
import { addressSchema, EMPTY_ADDRESS, type AddressValues } from '../profile-schema'

const ADDRESS_FIELDS: { name: keyof AddressValues; label: string; autoComplete: string; wide?: boolean }[] = [
  { name: 'street', label: 'Số nhà, tên đường', autoComplete: 'address-line1', wide: true },
  { name: 'ward', label: 'Phường/Xã', autoComplete: 'address-level3' },
  { name: 'district', label: 'Quận/Huyện', autoComplete: 'address-level2' },
  { name: 'province', label: 'Tỉnh/Thành phố', autoComplete: 'address-level1' },
]

interface ShippingAddressCardProps {
  profile: UserProfile
  onSaved: () => void
}

/** Backend lưu một địa chỉ duy nhất cho mỗi tài khoản: thêm khi chưa có, sửa khi đã có */
export function ShippingAddressCard({ profile, onSaved }: ShippingAddressCardProps) {
  const queryClient = useQueryClient()
  const address = profile.address
  const [isEditing, setIsEditing] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address ?? EMPTY_ADDRESS,
    mode: 'onTouched',
  })

  const saveMutation = useMutation({
    mutationFn: (values: AddressValues) => updateProfile({ address: values }),
    onSuccess: (saved) => {
      queryClient.setQueryData(profileQuery.queryKey, saved)
      setIsEditing(false)
      onSaved()
    },
  })

  const startEditing = () => {
    reset(address ?? EMPTY_ADDRESS)
    saveMutation.reset()
    setIsEditing(true)
  }

  const isSaving = saveMutation.isPending

  return (
    <section className="tf-card tf-card--roomy profile-section" aria-labelledby="profile-address-title">
      <div className="tf-card__head tf-card__head--wrap">
        <h2 id="profile-address-title" className="tf-section-title tf-section-title--md">
          <span className="tf-section-title__icon">
            <MapPin aria-hidden />
          </span>
          Địa chỉ nhận hàng
        </h2>
        {!address && !isEditing && (
          <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={startEditing}>
            <Plus aria-hidden />
            Thêm địa chỉ
          </button>
        )}
      </div>

      {isEditing ? (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => saveMutation.mutate(values))} noValidate>
          <div className="tf-field-grid">
            {ADDRESS_FIELDS.map((field) => {
              const error = errors[field.name]
              const id = `profile-address-${field.name}`
              return (
                <div key={field.name} className={`tf-field ${field.wide ? 'sm:col-span-2' : ''}`}>
                  <label htmlFor={id} className="tf-label">
                    {field.label} <span className="tf-required">*</span>
                  </label>
                  <input
                    id={id}
                    className={`tf-input ${error ? 'is-invalid' : ''}`}
                    autoComplete={field.autoComplete}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    disabled={isSaving}
                    {...register(field.name)}
                  />
                  {error && (
                    <p id={`${id}-error`} className="tf-field-error">
                      {error.message}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {saveMutation.error && (
            <p className="publish-error" role="alert">
              {getProfileErrorMessage(saveMutation.error)}
            </p>
          )}

          <div className="profile-actions">
            <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={() => setIsEditing(false)} disabled={isSaving}>
              Huỷ
            </button>
            <button type="submit" className="tf-btn tf-btn--primary tf-btn--inline" disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : 'Lưu địa chỉ'}
            </button>
          </div>
        </form>
      ) : address ? (
        <div className="address-card">
          <div className="address-card__head">
            <span className="address-card__who">
              <MapPin aria-hidden />
              <span className="font-semibold text-tf-ink">{profile.fullName}</span>
              <span className="tabular-nums text-tf-ink-muted">· {profile.phone}</span>
            </span>
          </div>
          <p className="address-card__line">
            {[address.street, address.ward, address.district, address.province].join(', ')}
          </p>
          <button type="button" className="address-card__edit" onClick={startEditing}>
            <Pencil aria-hidden />
            Sửa địa chỉ
          </button>
        </div>
      ) : (
        <p className="address-empty">Chưa có địa chỉ. Thêm địa chỉ để người cho thuê, người bán biết nơi giao đồ chơi.</p>
      )}
    </section>
  )
}
