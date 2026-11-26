import { Input, Radio, Select } from 'antd'
import { MapPin, Sparkles } from 'lucide-react'
import { useWatch, type Control } from 'react-hook-form'

import { FormField } from '../../../components/common'
import { OrganizationNeeds, RemoteAreaBadge } from '../../organizations/components/organization-needs'
import type { PublicOrganization } from '../../organizations/types'
import { handoverMethodLabels, handoverMethods, type HandoverMethod } from '../constants'
import { AUTO_MATCH, ORGANIZATION_NOTE_MAX, type DonationPostValues } from '../donation-post-schema'
import { DonationPostSection } from './donation-post-section'

/** Giá trị "mọi tỉnh" của bộ lọc tỉnh */
export const ALL_PROVINCES = ''

interface DonationReceiverSectionProps {
  control: Control<DonationPostValues>
  // GB-54: tổ chức gợi ý cho đồ chơi (đã lọc theo tỉnh); undefined khi chưa chọn danh mục và độ tuổi
  organizations: PublicOrganization[] | undefined
  organizationsLoading: boolean
  // GB-52: lọc gợi ý theo tỉnh của điểm nhận
  province: string
  provinces: string[]
  onProvinceChange: (province: string) => void
  categoryNames: ReadonlyMap<string, string>
  // Tổ chức được chọn sẵn (từ hồ sơ tổ chức) nhưng không nhận đồ chơi này
  droppedOrganizationName: string | null
  // GB-51: cách bàn giao mà điểm nhận của tổ chức đã chọn chấp nhận
  allowedMethods: readonly HandoverMethod[]
}

const HANDOVER_HINTS = {
  CARRIER: 'Gửi qua bưu cục (GHN, Viettel Post…) sau khi có tổ chức nhận.',
  SELF: 'Tự mang đồ chơi đến tận nơi theo lịch hẹn với tổ chức.',
} as const

/**
 * Bước 03–04: tổ chức nhận và cách bàn giao (R03 III.5.2.1 (4)–(7)). Danh sách là gợi ý GB-54 (nhận
 * danh mục và độ tuổi của đồ chơi, tỉnh của người tặng đứng đầu); chỉ bật cách bàn giao mà điểm nhận
 * của tổ chức đã chọn chấp nhận (GB-51). "Để ToyFlow ghép" giữ tin mở để Admin xin cho tổ chức phù hợp
 * (cũng là lựa chọn khi không có gợi ý, MSG50).
 */
export function DonationReceiverSection({
  control,
  organizations,
  organizationsLoading,
  province,
  provinces,
  onProvinceChange,
  categoryNames,
  droppedOrganizationName,
  allowedMethods,
}: DonationReceiverSectionProps) {
  const receiver = useWatch({ control, name: 'receiver' })
  return (
    <>
      <DonationPostSection
        step="03"
        title="Chọn đơn vị tiếp nhận"
        subtitle="Các tổ chức đã được ToyFlow xác minh và đang nhận đúng loại, đúng độ tuổi đồ chơi của bạn."
      >
        {organizations !== undefined && (organizations.length > 0 || province !== ALL_PROVINCES) && (
          <Select
            value={province}
            onChange={onProvinceChange}
            aria-label="Lọc theo tỉnh/thành của điểm nhận"
            className="mb-3 w-full sm:w-72"
            options={[
              { value: ALL_PROVINCES, label: 'Mọi tỉnh/thành' },
              ...provinces.map((item) => ({ value: item, label: item })),
            ]}
          />
        )}
        {droppedOrganizationName && (
          <p role="status" className="mb-2 text-sm text-amber-800">
            {droppedOrganizationName} không nhận đồ chơi thuộc danh mục hoặc độ tuổi này. Hãy chọn tổ chức khác bên dưới.
          </p>
        )}
        {organizations === undefined && (
          <p className="mb-2 text-sm text-tf-ink-muted">
            Chọn danh mục và độ tuổi ở bước 01 để xem các tổ chức đang cần món đồ này.
          </p>
        )}
        {/* MSG50 (R03 III.5.2.1 (6)): không tổ chức nào nhận thì tin được giữ mở */}
        {!organizationsLoading && organizations?.length === 0 && (
          <p className="mb-2 text-sm text-tf-ink-muted">Hiện chưa có tổ chức nào phù hợp với lựa chọn của bạn.</p>
        )}
        <FormField control={control} name="receiver">
          {(field) => (
            <Radio.Group value={field.value} onChange={(event) => field.onChange(event.target.value)} className="w-full">
              <ul className="flex flex-col gap-2">
                {organizationsLoading && <li aria-hidden className="h-16 animate-pulse rounded-lg bg-tf-surface" />}
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
                <li className="rounded-lg border border-dashed border-tf-outline p-3">
                  <Radio value={AUTO_MATCH}>
                    <span className="flex items-center gap-1 text-sm font-semibold text-tf-ink">
                      <Sparkles className="size-4 text-tf-accent" aria-hidden /> Để ToyFlow ghép tổ chức phù hợp nhất
                    </span>
                    <span className="block text-xs text-tf-ink-muted">
                      Admin chọn tổ chức đang thiếu nhóm đồ chơi này.
                    </span>
                  </Radio>
                </li>
              </ul>
            </Radio.Group>
          )}
        </FormField>
      </DonationPostSection>

      <DonationPostSection step="04" title="Phương thức bàn giao" subtitle="Bạn bàn giao đồ chơi cho tổ chức bằng cách nào.">
        <FormField control={control} name="handoverMethod" required>
          {(field) => (
            <Radio.Group value={field.value} onChange={(event) => field.onChange(event.target.value)} className="w-full">
              <div className="grid gap-2 sm:grid-cols-2">
                {handoverMethods.map((method) => {
                  const allowed = allowedMethods.includes(method)
                  return (
                    <div key={method} className="rounded-lg border border-tf-surface p-3">
                      <Radio value={method} disabled={!allowed}>
                        <span className="block text-sm font-semibold text-tf-ink">{handoverMethodLabels[method]}</span>
                        <span className="block text-xs text-tf-ink-muted">
                          {allowed ? HANDOVER_HINTS[method] : 'Điểm nhận của tổ chức đã chọn không nhận cách này.'}
                        </span>
                      </Radio>
                    </div>
                  )
                })}
              </div>
            </Radio.Group>
          )}
        </FormField>
        {/* R03 III.5.2.1 (8): ghi chú gửi kèm yêu cầu tới tổ chức đã chọn */}
        {receiver && receiver !== AUTO_MATCH && (
          <FormField
            control={control}
            name="note"
            label="Ghi chú cho tổ chức"
            extra="Không bắt buộc. Ví dụ: thiếu chi tiết, vết xước, cần lưu ý khi nhận."
          >
            {(field) => (
              <Input.TextArea
                {...field}
                value={field.value ?? ''}
                rows={3}
                maxLength={ORGANIZATION_NOTE_MAX}
                showCount
                placeholder="Ghi chú ngắn cho tổ chức nhận"
              />
            )}
          </FormField>
        )}
      </DonationPostSection>
    </>
  )
}
