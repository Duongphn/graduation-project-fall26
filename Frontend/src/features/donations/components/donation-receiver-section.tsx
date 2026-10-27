import { Input, Radio } from 'antd'
import { MapPin, Search, Sparkles } from 'lucide-react'
import type { Control } from 'react-hook-form'

import { FormField } from '../../../components/common'
import type { PublicOrganization } from '../../organizations/types'
import { handoverMethodLabels, handoverMethods } from '../constants'
import { AUTO_MATCH, type DonationPostValues } from '../donation-post-schema'
import { DonationPostSection } from './donation-post-section'

interface DonationReceiverSectionProps {
  control: Control<DonationPostValues>
  organizations: PublicOrganization[]
  organizationsLoading: boolean
  // Tìm tổ chức theo tên (danh sách chỉ tải một trang đầu)
  keyword: string
  onKeywordChange: (keyword: string) => void
  // Tổng số tổ chức khớp từ khoá, để báo còn tổ chức chưa hiện
  total: number | undefined
}

const HANDOVER_HINTS = {
  CARRIER: 'Gửi qua bưu cục (GHN, Viettel Post…) sau khi có tổ chức nhận.',
  SELF: 'Tự mang đồ chơi đến tận nơi theo lịch hẹn với tổ chức.',
} as const

/** Bước 03–04: tổ chức mong muốn (Admin ghép khi tạo yêu cầu) và cách bàn giao */
export function DonationReceiverSection({
  control,
  organizations,
  organizationsLoading,
  keyword,
  onKeywordChange,
  total,
}: DonationReceiverSectionProps) {
  const hiddenCount = total !== undefined ? Math.max(0, total - organizations.length) : 0

  return (
    <>
      <DonationPostSection
        step="03"
        title="Chọn đơn vị tiếp nhận"
        subtitle="Tổ chức đã được ToyFlow xác minh. Xem nhu cầu để chọn nơi phù hợp với món đồ."
      >
        <Input
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          allowClear
          maxLength={100}
          prefix={<Search className="size-4 text-tf-ink-muted" aria-hidden />}
          placeholder="Tìm tổ chức theo tên, ví dụ: Hoa Hồng"
          aria-label="Tìm tổ chức tiếp nhận"
          className="mb-3"
        />
        {hiddenCount > 0 && (
          <p className="mb-2 text-xs text-tf-ink-muted">
            Còn {hiddenCount} tổ chức khác — gõ tên để tìm đúng nơi bạn muốn tặng.
          </p>
        )}
        {!organizationsLoading && keyword.trim() && organizations.length === 0 && (
          <p className="mb-2 text-sm text-tf-ink-muted">Không tìm thấy tổ chức nào khớp “{keyword.trim()}”.</p>
        )}
        <FormField control={control} name="receiver">
          {(field) => (
            <Radio.Group value={field.value} onChange={(event) => field.onChange(event.target.value)} className="w-full">
              <ul className="flex flex-col gap-2">
                {organizationsLoading && (
                  <li aria-hidden className="h-16 animate-pulse rounded-lg bg-tf-surface" />
                )}
                {organizations.map((organization) => (
                  <li key={organization.id} className="rounded-lg border border-tf-surface p-3">
                    <Radio value={organization.id}>
                      <span className="block text-sm font-semibold text-tf-ink">{organization.name}</span>
                      <span className="flex items-center gap-1 text-xs text-tf-ink-muted">
                        <MapPin className="size-3.5" aria-hidden />
                        {organization.address}
                      </span>
                      <span className="line-clamp-1 block text-xs text-tf-ink-muted">
                        Cần: {organization.supportCriteria}
                      </span>
                    </Radio>
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
                {handoverMethods.map((method) => (
                  <div key={method} className="rounded-lg border border-tf-surface p-3">
                    <Radio value={method}>
                      <span className="block text-sm font-semibold text-tf-ink">{handoverMethodLabels[method]}</span>
                      <span className="block text-xs text-tf-ink-muted">{HANDOVER_HINTS[method]}</span>
                    </Radio>
                  </div>
                ))}
              </div>
            </Radio.Group>
          )}
        </FormField>
      </DonationPostSection>
    </>
  )
}
