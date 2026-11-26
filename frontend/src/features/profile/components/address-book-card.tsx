import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Popconfirm } from 'antd'
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  createAddress,
  deleteAddress,
  getProfileErrorMessage,
  updateAddress,
  type DeliveryAddress,
  type UserProfile,
} from '../profile-api'
import { addressesQuery } from '../profile-queries'
import { addressSchema, type AddressValues } from '../profile-schema'

type TextField = Exclude<keyof AddressValues, 'isDefault'>

const ADDRESS_FIELDS: { name: TextField; label: string; autoComplete: string; wide?: boolean; inputMode?: 'tel' }[] = [
  { name: 'recipientName', label: 'Người nhận', autoComplete: 'name' },
  { name: 'phone', label: 'Số điện thoại', autoComplete: 'tel', inputMode: 'tel' },
  { name: 'province', label: 'Tỉnh/Thành phố', autoComplete: 'address-level1' },
  { name: 'ward', label: 'Phường/Xã', autoComplete: 'address-level2' },
  { name: 'street', label: 'Số nhà, tên đường', autoComplete: 'address-line1', wide: true },
]

/** Dòng địa chỉ đầy đủ: số nhà, phường/xã, tỉnh/thành (không còn cấp quận/huyện) */
const formatAddressLine = (address: Pick<DeliveryAddress, 'street' | 'ward' | 'province'>) =>
  [address.street, address.ward, address.province].join(', ')

/** Đang sửa: địa chỉ cần sửa; 'new': thêm địa chỉ; null: đóng hộp thoại */
type Editing = DeliveryAddress | 'new' | null

interface AddressBookCardProps {
  profile: UserProfile
  onSaved: (message: string) => void
}

/** Sổ địa chỉ giao nhận (R03 III.6.1.1 (9)–(11)): nhiều địa chỉ, một mặc định, thêm/sửa/xoá */
export function AddressBookCard({ profile, onSaved }: AddressBookCardProps) {
  const queryClient = useQueryClient()
  const addresses = useQuery(addressesQuery)
  const [editing, setEditing] = useState<Editing>(null)
  const list = addresses.data ?? []

  const refresh = () => queryClient.invalidateQueries({ queryKey: addressesQuery.queryKey })

  const saveMutation = useMutation({
    mutationFn: (values: AddressValues) =>
      editing && editing !== 'new' ? updateAddress(editing.id, values) : createAddress(values),
    onSuccess: async () => {
      const added = editing === 'new'
      await refresh()
      setEditing(null)
      onSaved(added ? 'Đã thêm địa chỉ.' : 'Đã lưu địa chỉ.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAddress,
    onSuccess: async () => {
      await refresh()
      onSaved('Đã xoá địa chỉ.')
    },
  })

  const openEditor = (target: Exclude<Editing, null>) => {
    saveMutation.reset()
    setEditing(target)
  }

  // Mặc định cho địa chỉ mới: người nhận là chủ tài khoản; địa chỉ đầu tiên luôn là mặc định
  const initialValues: AddressValues =
    editing && editing !== 'new'
      ? { ...editing }
      : {
          recipientName: profile.fullName,
          phone: /^0\d{9}$/.test(profile.phone) ? profile.phone : '',
          province: '',
          ward: '',
          street: '',
          isDefault: list.length === 0,
        }

  return (
    <section className="tf-card tf-card--roomy profile-section" aria-labelledby="profile-address-title">
      <div className="tf-card__head tf-card__head--wrap">
        <h2 id="profile-address-title" className="tf-section-title tf-section-title--md">
          <span className="tf-section-title__icon">
            <MapPin aria-hidden />
          </span>
          Địa chỉ nhận hàng
        </h2>
        <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={() => openEditor('new')}>
          <Plus aria-hidden />
          Thêm địa chỉ
        </button>
      </div>

      {addresses.isError ? (
        <div className="address-empty" role="alert">
          {getProfileErrorMessage(addresses.error)}{' '}
          <button type="button" className="address-card__edit inline-flex" onClick={() => void addresses.refetch()}>
            Thử lại
          </button>
        </div>
      ) : addresses.isPending ? (
        <p className="address-empty">Đang tải sổ địa chỉ...</p>
      ) : list.length === 0 ? (
        <p className="address-empty">Chưa có địa chỉ. Thêm địa chỉ để người cho thuê, người bán biết nơi giao đồ chơi.</p>
      ) : (
        <ul className="address-book" aria-label="Sổ địa chỉ">
          {list.map((address) => (
            <li key={address.id} className="address-card">
              <div className="address-card__head">
                <span className="address-card__who">
                  <MapPin aria-hidden />
                  <span className="font-semibold text-tf-ink">{address.recipientName}</span>
                  <span className="tabular-nums text-tf-ink-muted">· {address.phone}</span>
                </span>
                {address.isDefault && (
                  <span className="address-card__default">
                    <Star aria-hidden /> Mặc định
                  </span>
                )}
              </div>
              <p className="address-card__line">{formatAddressLine(address)}</p>
              <div className="address-card__actions">
                <button
                  type="button"
                  className="address-card__edit"
                  onClick={() => openEditor(address)}
                  aria-label={`Sửa địa chỉ ${formatAddressLine(address)}`}
                >
                  <Pencil aria-hidden />
                  Sửa
                </button>
                <Popconfirm
                  title="Xoá địa chỉ này?"
                  description={address.isDefault && list.length > 1 ? 'Địa chỉ được thêm sớm nhất còn lại sẽ thành mặc định.' : undefined}
                  okText="Xoá"
                  cancelText="Huỷ"
                  okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
                  onConfirm={() => deleteMutation.mutateAsync(address.id).catch(() => undefined)}
                >
                  <button
                    type="button"
                    className="address-card__edit address-card__delete"
                    aria-label={`Xoá địa chỉ ${formatAddressLine(address)}`}
                  >
                    <Trash2 aria-hidden />
                    Xoá
                  </button>
                </Popconfirm>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteMutation.error && (
        <p className="publish-error" role="alert">
          {getProfileErrorMessage(deleteMutation.error)}
        </p>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Thêm địa chỉ nhận hàng' : 'Sửa địa chỉ nhận hàng'}
        onCancel={() => setEditing(null)}
        footer={null}
        destroyOnHidden
        width={560}
      >
        {editing !== null && (
          <AddressForm
            initialValues={initialValues}
            // Địa chỉ đầu tiên và địa chỉ đang mặc định: luôn là mặc định, không bỏ tick được
            defaultLocked={list.length === 0 || (editing !== 'new' && editing.isDefault)}
            saving={saveMutation.isPending}
            error={saveMutation.error ? getProfileErrorMessage(saveMutation.error) : null}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => saveMutation.mutate(values)}
          />
        )}
      </Modal>
    </section>
  )
}

interface AddressFormProps {
  initialValues: AddressValues
  defaultLocked: boolean
  saving: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (values: AddressValues) => void
}

function AddressForm({ initialValues, defaultLocked, saving, error, onCancel, onSubmit }: AddressFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })

  return (
    <form className="flex flex-col gap-4 pt-2" onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Địa chỉ nhận hàng">
      <div className="tf-field-grid">
        {ADDRESS_FIELDS.map((field) => {
          const fieldError = errors[field.name]
          const id = `address-${field.name}`
          return (
            <div key={field.name} className={`tf-field ${field.wide ? 'sm:col-span-2' : ''}`}>
              <label htmlFor={id} className="tf-label">
                {field.label} <span className="tf-required">*</span>
              </label>
              <input
                id={id}
                className={`tf-input ${fieldError ? 'is-invalid' : ''}`}
                autoComplete={field.autoComplete}
                inputMode={field.inputMode}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? `${id}-error` : undefined}
                disabled={saving}
                {...register(field.name)}
              />
              {fieldError && (
                <p id={`${id}-error`} className="tf-field-error">
                  {fieldError.message}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {defaultLocked ? (
        <p className="tf-caption">Đây là địa chỉ mặc định, được điền sẵn khi bạn đặt thuê hoặc mua đồ chơi.</p>
      ) : (
        <label className="address-form__default">
          <input type="checkbox" disabled={saving} {...register('isDefault')} />
          Đặt làm địa chỉ mặc định
        </label>
      )}

      {error && (
        <p className="publish-error" role="alert">
          {error}
        </p>
      )}

      <div className="profile-actions">
        <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="tf-btn tf-btn--primary tf-btn--inline" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu địa chỉ'}
        </button>
      </div>
    </form>
  )
}
