import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Input, Radio } from 'antd'
import { MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { FormField, FormModal } from '../../../components/common'
import { myDonationPath } from '../../../routes/paths'
import { ApiError, getErrorMessage } from '../../../services/api-error'
import { useCategoryNames } from '../../organizations/hooks'
import { OrganizationNeeds, RemoteAreaBadge } from '../../organizations/components/organization-needs'
import { organizationSuggestionsQuery } from '../../organizations/public-queries'
import { addressesQuery } from '../../profile/profile-queries'
import type { ToyListing } from '../../toy-listings/toy-listing-api'
import { MY_LISTINGS_ROOT_KEY } from '../../toy-listings/toy-listing-queries'
import { handoverMethodLabels, handoverMethods } from '../constants'
import { allowedHandoverMethods, ORGANIZATION_NOTE_MAX } from '../donation-post-schema'
import { useSendToOrganization } from '../donor-queries'
import { handoverMethodValues, sendToOrganizationSchema, type SendToOrganizationValues } from '../schemas'

interface SendToOrganizationModalProps {
  open: boolean
  onClose: () => void
  toy: Pick<ToyListing, 'id' | 'title' | 'categoryId' | 'ageRange'>
}

// Tổ chức vừa ngừng nhận, bị ẩn hoặc chưa có điểm nhận (MSG51): tải lại gợi ý để chọn tổ chức khác
const ORGANIZATION_GONE = new Set([
  'ORGANIZATION_NOT_ACCEPTING',
  'ORGANIZATION_NOT_AVAILABLE',
  'ORGANIZATION_NOT_FOUND',
  'ORGANIZATION_NO_RECEIVING_POINT',
  'HANDOVER_METHOD_NOT_ALLOWED',
])

// Tin vừa bị ẩn, xoá hoặc đã có người được đồng ý tặng
const TOY_GONE = new Set(['TOY_NOT_AVAILABLE', 'TOY_NOT_FOUND'])

const EMPTY_VALUES: SendToOrganizationValues = { organizationId: '', handoverMethod: 'CARRIER', note: '' }

/**
 * UC33 (GB-56): người tặng chọn một tin tặng đang hiển thị của mình và gửi tới tổ chức. Danh sách là
 * gợi ý GB-54 (tổ chức nhận danh mục và độ tuổi của đồ chơi, tỉnh của địa chỉ mặc định đứng đầu); chỉ
 * bật cách bàn giao mà điểm nhận của tổ chức chấp nhận (GB-51). Phiếu ở trạng thái chờ, Admin quyết
 * định thay tổ chức (POST /donation-requests/to-organization).
 */
export function SendToOrganizationModal({ open, onClose, toy }: SendToOrganizationModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [failure, setFailure] = useState<string | null>(null)
  const categoryNames = useCategoryNames()

  const addresses = useQuery({ ...addressesQuery, enabled: open, retry: false })
  const donorProvince = addresses.data?.find((address) => address.isDefault)?.province
  const suggestions = useQuery({
    ...organizationSuggestionsQuery({
      categoryId: toy.categoryId,
      minAge: toy.ageRange.minAge,
      maxAge: toy.ageRange.maxAge,
      ...(donorProvince ? { province: donorProvince } : {}),
    }),
    // Chờ địa chỉ (hoặc lỗi địa chỉ) để thứ tự gợi ý theo tỉnh không nhảy sau khi hiện
    enabled: open && !addresses.isPending,
  })
  const organizations = suggestions.data

  const { control, handleSubmit, reset, setValue } = useForm<SendToOrganizationValues>({
    resolver: zodResolver(sendToOrganizationSchema),
    defaultValues: EMPTY_VALUES,
  })
  const [organizationId, handoverMethod] = useWatch({ control, name: ['organizationId', 'handoverMethod'] })
  const chosen = organizations?.find((organization) => organization.id === organizationId)

  // Tổ chức đã chọn không còn trong gợi ý (vừa tải lại sau lỗi): bỏ chọn
  useEffect(() => {
    if (organizationId && organizations && !chosen) setValue('organizationId', '')
  }, [organizationId, organizations, chosen, setValue])

  // GB-51: chỉ cách bàn giao mà điểm nhận của tổ chức đã chọn chấp nhận
  const allowedMethods = useMemo(() => allowedHandoverMethods(chosen), [chosen])
  useEffect(() => {
    const [onlyMethod] = allowedMethods
    if (!allowedMethods.includes(handoverMethod) && onlyMethod) setValue('handoverMethod', onlyMethod)
  }, [allowedMethods, handoverMethod, setValue])

  const close = () => {
    reset(EMPTY_VALUES)
    setFailure(null)
    onClose()
  }

  const send = useSendToOrganization({
    onSent: (request) => {
      close()
      navigate(myDonationPath(request.id))
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : undefined
      if (code && ORGANIZATION_GONE.has(code)) {
        void queryClient.invalidateQueries({ queryKey: ['public-organizations'] })
      }
      if (code && TOY_GONE.has(code)) void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_ROOT_KEY })
      setFailure(
        code === 'USER_NOT_VERIFIED'
          ? 'Bạn cần xác minh danh tính (CCCD) trước khi quyên góp. Vào Hồ sơ của tôi → Xác minh danh tính.'
          : getErrorMessage(error),
      )
      return true
    },
  })

  const submit = handleSubmit((values) => {
    setFailure(null)
    send.mutate({
      toyId: toy.id,
      organizationId: values.organizationId,
      handoverMethod: handoverMethodValues[values.handoverMethod],
      ...(values.note ? { message: values.note } : {}),
    })
  })

  return (
    <FormModal
      open={open}
      title="Gửi tới tổ chức"
      okText="Gửi tới tổ chức"
      loading={send.isPending}
      okDisabled={organizations?.length === 0}
      width={600}
      onCancel={close}
      onSubmit={() => void submit()}
    >
      <p className="mb-4 text-sm leading-6 text-tf-ink-muted">
        “<span className="font-semibold text-tf-ink">{toy.title}</span>” sẽ được gửi tới tổ chức bạn chọn. ToyFlow chấp
        nhận hoặc từ chối thay tổ chức; trong lúc chờ, tin vẫn hiển thị. Khi được chấp nhận, tin được ẩn khỏi danh sách
        để bạn bàn giao.
      </p>

      <FormField control={control} name="organizationId" label="Tổ chức tiếp nhận" required>
        {(field) => (
          <Radio.Group value={field.value} onChange={(event) => field.onChange(event.target.value)} className="w-full">
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {suggestions.isPending && <li aria-hidden className="h-16 animate-pulse rounded-lg bg-tf-surface" />}
              {(organizations ?? []).map((organization) => (
                <li key={organization.id} className="rounded-lg border border-tf-surface p-3">
                  <Radio value={organization.id}>
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-tf-ink">
                      {organization.name}
                      {organization.isRemoteArea && <RemoteAreaBadge />}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-tf-ink-muted">
                      <MapPin className="size-3.5" aria-hidden />
                      {organization.address}
                    </span>
                  </Radio>
                  <div className="mt-1 pl-6 text-xs">
                    <OrganizationNeeds organization={organization} categoryNames={categoryNames} />
                  </div>
                </li>
              ))}
            </ul>
          </Radio.Group>
        )}
      </FormField>
      {suggestions.isError && (
        <p role="alert" className="-mt-2 mb-4 text-sm text-red-600">
          Không tải được danh sách tổ chức. Vui lòng thử lại sau.
        </p>
      )}
      {/* MSG50: không tổ chức nào nhận đồ chơi này thì tin vẫn mở để Admin ghép */}
      {organizations?.length === 0 && (
        <p role="status" className="-mt-2 mb-4 text-sm text-tf-ink-muted">
          Hiện chưa có tổ chức nào nhận danh mục và độ tuổi của đồ chơi này. Tin vẫn mở để người nhận xin hoặc ToyFlow
          ghép tổ chức phù hợp.
        </p>
      )}

      <FormField control={control} name="handoverMethod" label="Phương thức bàn giao" required>
        {(field) => (
          <Radio.Group value={field.value} onChange={(event) => field.onChange(event.target.value)} className="w-full">
            <div className="grid gap-2 sm:grid-cols-2">
              {handoverMethods.map((method) => {
                const allowed = allowedMethods.includes(method)
                return (
                  <div key={method} className="rounded-lg border border-tf-surface p-3">
                    <Radio value={method} disabled={!allowed}>
                      <span className="block text-sm font-semibold text-tf-ink">{handoverMethodLabels[method]}</span>
                      {!allowed && (
                        <span className="block text-xs text-tf-ink-muted">
                          Điểm nhận của tổ chức đã chọn không nhận cách này.
                        </span>
                      )}
                    </Radio>
                  </div>
                )
              })}
            </div>
          </Radio.Group>
        )}
      </FormField>

      <FormField
        control={control}
        name="note"
        label="Ghi chú cho tổ chức"
        extra="Không bắt buộc. Ví dụ: thiếu chi tiết, vết xước, cần lưu ý khi nhận."
      >
        {(field) => (
          <Input.TextArea
            {...field}
            rows={3}
            maxLength={ORGANIZATION_NOTE_MAX}
            showCount
            placeholder="Ghi chú ngắn cho tổ chức nhận"
          />
        )}
      </FormField>

      {failure && <Alert type="warning" showIcon title={failure} />}
    </FormModal>
  )
}
