import { App, Alert, Button, Card, Descriptions, Input, InputNumber, Radio, Typography } from 'antd'
import { useState } from 'react'

import { DISPUTE_VERDICT_LABELS } from '../../rentals/rental-display'
import { formatVnd, vndInputFormatter, vndInputParser } from '../../toy-listings/format-vnd'
import { previewPayout, ROLE_LABELS } from '../format'
import { useResolveDispute } from '../hooks'
import type { AdminDisputeCase, DisputeVerdict } from '../types'

const REASON_MIN = 30
const REASON_MAX = 500
const VERDICTS: DisputeVerdict[] = ['CLAIMANT_FAVORED', 'PARTIAL', 'RESPONDENT_FAVORED']

/**
 * Admin verdict: conclusion, compensation (0 when the claim is dismissed, otherwise 1..cap) and a
 * 30–500 character reason. The split is previewed with the server formula; issuing asks once more,
 * since a verdict cannot be changed.
 */
export function DisputeVerdictForm({ data }: { data: AdminDisputeCase }) {
  const { modal } = App.useApp()
  const { dispute, compensationCap: cap, caseFile } = data
  const [verdict, setVerdict] = useState<DisputeVerdict>()
  const [compensation, setCompensation] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const resolve = useResolveDispute(dispute.id)

  // Dismissing the claim, or a cap of 0, pays nothing: the amount is fixed at 0
  const amountLocked = verdict === 'RESPONDENT_FAVORED' || cap === 0
  const amount = amountLocked ? 0 : (compensation ?? 0)
  const reasonLength = reason.trim().length
  const claimant = ROLE_LABELS[dispute.claimantRole].toLowerCase()

  const errors = {
    verdict: !verdict ? 'Chọn kết luận.' : null,
    amount: amountLocked
      ? null
      : !compensation || compensation <= 0
        ? 'Phán quyết này cần số tiền bồi thường lớn hơn 0.'
        : compensation > cap
          ? `Tối đa ${formatVnd(cap)}.`
          : null,
    reason:
      reasonLength < REASON_MIN || reasonLength > REASON_MAX ? `Lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` : null,
  }
  const payout = previewPayout(caseFile.amounts, dispute.claimantRole, amount)

  const submit = () => {
    setTouched(true)
    if (!verdict || errors.amount || errors.reason) return
    modal.confirm({
      title: 'Ban hành phán quyết?',
      content: `${DISPUTE_VERDICT_LABELS[verdict]}, bồi thường ${formatVnd(amount)}. Tiền ký quỹ được chia ngay: người thuê ${formatVnd(payout.renter)}, chủ đồ ${formatVnd(payout.owner)}, nền tảng ${formatVnd(payout.platform)}. Đơn chuyển sang Hoàn tất và phán quyết không thể sửa.`,
      okText: 'Ban hành',
      okButtonProps: { danger: true },
      cancelText: 'Xem lại',
      onOk: () => resolve.mutateAsync({ verdict, compensation: amount, reason: reason.trim() }).catch(() => undefined),
    })
  }

  const show = (message: string | null) => (touched ? message : null)

  return (
    <Card title="Phán quyết">
      <div className="flex flex-col gap-4">
        <div>
          <Typography.Text strong>Kết luận</Typography.Text>
          <Radio.Group
            className="!mt-2 flex flex-col gap-2"
            value={verdict}
            disabled={resolve.isPending}
            onChange={(event) => setVerdict(event.target.value as DisputeVerdict)}
            options={VERDICTS.map((value) => ({ value, label: DISPUTE_VERDICT_LABELS[value] }))}
          />
          {show(errors.verdict) && <Typography.Text type="danger">{errors.verdict}</Typography.Text>}
        </div>

        <div>
          <Typography.Text strong>Bồi thường cho {claimant}</Typography.Text>
          <InputNumber<number>
            className="!mt-2 !w-full"
            min={0}
            max={cap}
            step={10_000}
            value={amountLocked ? 0 : compensation}
            disabled={amountLocked || resolve.isPending}
            formatter={vndInputFormatter}
            parser={vndInputParser}
            addonAfter="₫"
            status={show(errors.amount) ? 'error' : undefined}
            aria-label={`Số tiền bồi thường cho ${claimant}`}
            onChange={(value) => setCompensation(value)}
          />
          <Typography.Text type={show(errors.amount) ? 'danger' : 'secondary'} className="text-xs">
            {show(errors.amount) ??
              (cap === 0
                ? 'Không có khoản nào để bồi thường (mức tối đa 0 ₫).'
                : `Tối đa ${formatVnd(cap)} (${dispute.claimantRole === 'owner' ? 'tiền cọc sau khi trừ phí trả trễ' : 'tiền thuê người thuê đã trả'}).`)}
          </Typography.Text>
        </div>

        <div>
          <Typography.Text strong>Lý do phán quyết</Typography.Text>
          <Input.TextArea
            className="!mt-2"
            value={reason}
            maxLength={REASON_MAX}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            disabled={resolve.isPending}
            status={show(errors.reason) ? 'error' : undefined}
            aria-label="Lý do phán quyết"
            placeholder="Căn cứ vào ảnh lúc giao, lúc trả và giải thích của hai bên…"
            onChange={(event) => setReason(event.target.value)}
          />
          {show(errors.reason) && <Typography.Text type="danger">{errors.reason}</Typography.Text>}
        </div>

        <Descriptions size="small" column={1} bordered title="Chia tiền dự kiến">
          <Descriptions.Item label="Người thuê nhận">{formatVnd(payout.renter)}</Descriptions.Item>
          <Descriptions.Item label="Chủ đồ nhận">{formatVnd(payout.owner)}</Descriptions.Item>
          <Descriptions.Item label="Nền tảng">{formatVnd(payout.platform)}</Descriptions.Item>
        </Descriptions>

        <Alert type="warning" showIcon message="Phán quyết không thể sửa sau khi ban hành." />

        <Button type="primary" danger block loading={resolve.isPending} onClick={submit}>
          Ban hành phán quyết
        </Button>
      </div>
    </Card>
  )
}
