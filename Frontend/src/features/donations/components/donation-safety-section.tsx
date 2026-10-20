import { Checkbox } from 'antd'
import { CircleAlert, ShieldCheck, ShieldX } from 'lucide-react'
import type { Control } from 'react-hook-form'

import { FormField } from '../../../components/common'
import { BANNED_TOY_TERMS, SAFETY_COMMITMENTS, type DonationPostValues } from '../donation-post-schema'
import { DonationPostSection } from './donation-post-section'

interface DonationSafetySectionProps {
  control: Control<DonationPostValues>
  checkedCount: number
  // Từ cấm tìm thấy trong tên/mô tả
  bannedTerms: string[]
}

/** Bước 02: cam kết 4 tiêu chí an toàn và chặn đồ chơi thuộc danh mục cấm */
export function DonationSafetySection({ control, checkedCount, bannedTerms }: DonationSafetySectionProps) {
  const passed = checkedCount === SAFETY_COMMITMENTS.length && bannedTerms.length === 0

  return (
    <DonationPostSection
      step="02"
      title="Kiểm duyệt an toàn bắt buộc"
      subtitle="Bảo vệ sức khoẻ và thể chất các em nhỏ tại nơi tiếp nhận."
      badge={<span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Chốt chặn an toàn</span>}
    >
      <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        Mọi đồ chơi quyên góp phải vượt qua 4 tiêu chí an toàn và vệ sinh dưới đây. Admin kiểm tra lại ảnh trước khi
        tin được hiển thị cho các tổ chức.
      </p>

      <FormField control={control} name="safety" label={`Bảng kiểm cam kết (${checkedCount}/${SAFETY_COMMITMENTS.length})`} required>
        {(field) => (
          <ul className="flex flex-col gap-2">
            {SAFETY_COMMITMENTS.map((item) => (
              <li key={item.key} className="rounded-lg border border-tf-surface p-3">
                <Checkbox
                  checked={field.value[item.key]}
                  onChange={(event) => field.onChange({ ...field.value, [item.key]: event.target.checked })}
                >
                  <span className="block text-sm font-semibold text-tf-ink">{item.title}</span>
                  <span className="block text-xs text-tf-ink-muted">{item.hint}</span>
                </Checkbox>
              </li>
            ))}
          </ul>
        )}
      </FormField>

      <div
        role="status"
        className={`flex items-start gap-3 rounded-lg p-3 text-sm leading-6 ${
          passed ? 'bg-tf-secondary-container text-tf-secondary' : 'bg-tf-page text-tf-ink-muted'
        }`}
      >
        {passed ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        ) : (
          <ShieldX className="mt-0.5 size-5 shrink-0" aria-hidden />
        )}
        <span>
          {bannedTerms.length > 0
            ? `Đồ chơi có "${bannedTerms.join('", "')}" thuộc danh mục bị từ chối tiếp nhận.`
            : passed
              ? 'Đạt đủ tiêu chí an toàn. Admin sẽ kiểm tra ảnh trước khi duyệt.'
              : `Còn ${SAFETY_COMMITMENTS.length - checkedCount} tiêu chí chưa xác nhận.`}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
        <p className="flex items-center gap-2 font-semibold">
          <CircleAlert className="size-4" aria-hidden /> Danh mục đồ chơi bị từ chối tiếp nhận
        </p>
        <p>{BANNED_TOY_TERMS.map(({ label }) => label).join(', ')}; đồ chơi hỏng pin rò rỉ, vỡ nhọn hoặc ẩm mốc.</p>
      </div>
    </DonationPostSection>
  )
}
