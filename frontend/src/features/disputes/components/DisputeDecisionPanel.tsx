import { SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Descriptions, Input, Radio, Segmented, Typography } from 'antd'
import { useId, useState } from 'react'

import { formatDateTime, formatMoney } from '../../../utils/format'
import { useNow } from '../../rentals/rental-display'
import { useResolveDispute } from '../hooks'
import {
  COMPENSATION_RATES,
  DECISION_MAX,
  DECISION_MIN,
  previewRuling,
  RULING_OPTIONS,
  rulingLabel,
  rulingUpholdsClaim,
} from '../ruling'
import type { DisputeDetail, DisputeRuling } from '../types'

/** Phán quyết đã ra: không sửa được (GB-26). */
function DisputeResult({ dispute }: { dispute: DisputeDetail }) {
  const resolution = dispute.resolution
  if (!resolution) return null
  return (
    <Card title="Phán quyết" size="small">
      <Alert
        className="mb-3"
        type="success"
        showIcon
        title={`Đã giải quyết lúc ${formatDateTime(resolution.resolvedAt ?? dispute.resolvedAt)}`}
        description="Tiền đã được chia theo phán quyết, đơn thuê đã hoàn tất. Phán quyết không sửa được."
      />
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Phán quyết">{rulingLabel(resolution.ruling)}</Descriptions.Item>
        <Descriptions.Item label="Tỷ lệ bồi thường">{resolution.compensationRate}%</Descriptions.Item>
        {resolution.compensationAmount > 0 && (
          <Descriptions.Item label="Bồi thường cho chủ đồ">{formatMoney(resolution.compensationAmount)}</Descriptions.Item>
        )}
        {resolution.rentRefundAmount > 0 && (
          <Descriptions.Item label="Hoàn tiền thuê">{formatMoney(resolution.rentRefundAmount)}</Descriptions.Item>
        )}
        <Descriptions.Item label="Chủ đồ nhận">{formatMoney(resolution.ownerAmount)}</Descriptions.Item>
        <Descriptions.Item label="Người thuê nhận">{formatMoney(resolution.renterAmount)}</Descriptions.Item>
        <Descriptions.Item label="Phí nền tảng">{formatMoney(resolution.platformFee)}</Descriptions.Item>
        <Descriptions.Item label="Lý do">{resolution.adminDecision}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

/**
 * Admin decision (UC19, R03 III.7.4.1 fields 8–13): ruling, compensation rate, split preview and a
 * 30–500 character reason sent to both parties. Issuing it pays out the frozen R + D.
 */
export function DisputeDecisionPanel({ dispute }: { dispute: DisputeDetail }) {
  const { modal } = App.useApp()
  const noteId = useId()
  const [ruling, setRuling] = useState<DisputeRuling | undefined>()
  const [rate, setRate] = useState<number>(0)
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const resolve = useResolveDispute(dispute.id)
  const now = useNow()

  if (dispute.resolution || dispute.status === 'resolved' || dispute.status === 'closed') {
    return <DisputeResult dispute={dispute} />
  }

  const waiting = new Date(dispute.replyDueAt).getTime() > now
  const upholds = ruling ? rulingUpholdsClaim(ruling, dispute.claimant) : false
  const appliedRate = upholds ? rate : 0
  const lateFee = dispute.rentalOrder.returnInfo?.lateFee ?? 0
  const split = previewRuling(dispute.rentalOrder.pricing, lateFee, dispute.claimant, ruling ?? 'UNDETERMINED', appliedRate)
  const noteLength = note.trim().length
  const noteError =
    touched && noteLength < DECISION_MIN ? `Lý do phán quyết cần ít nhất ${DECISION_MIN} ký tự.` : null
  const rulingError = touched && !ruling ? 'Vui lòng chọn phán quyết.' : null
  const rateLabel = dispute.claimant === 'owner' ? 'Bồi thường cho chủ đồ (% tiền cọc)' : 'Hoàn tiền thuê cho người thuê (% tiền thuê)'

  const submit = () => {
    setTouched(true)
    if (!ruling || noteLength < DECISION_MIN) return
    modal.confirm({
      title: 'Ra phán quyết và quyết toán đơn thuê?',
      content: `Chủ đồ nhận ${formatMoney(split.owner)}, người thuê nhận ${formatMoney(split.renter)}, phí nền tảng ${formatMoney(split.platform)}. Đơn thuê sẽ hoàn tất và phán quyết không sửa được.`,
      okText: 'Ra phán quyết',
      cancelText: 'Xem lại',
      onOk: () =>
        resolve.mutateAsync({ ruling, compensationRate: appliedRate, adminDecision: note.trim() }).catch(() => undefined),
    })
  }

  return (
    <Card title="Quyết định của quản trị viên" size="small">
      {waiting && (
        <Alert
          className="mb-3"
          type="info"
          showIcon
          title={`Người thuê có thể phản hồi đến ${formatDateTime(dispute.replyDueAt)}`}
          description="Bạn ra phán quyết được sau thời hạn này (R03 UC19)."
        />
      )}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Typography.Text strong id={`${noteId}-ruling`}>
            Phán quyết
          </Typography.Text>
          <Radio.Group
            aria-labelledby={`${noteId}-ruling`}
            value={ruling}
            disabled={waiting || resolve.isPending}
            onChange={(event) => setRuling(event.target.value as DisputeRuling)}
            options={RULING_OPTIONS}
            className="flex flex-col gap-1"
          />
          {rulingError && <Typography.Text type="danger">{rulingError}</Typography.Text>}
        </div>

        <div className="flex flex-col gap-2">
          <Typography.Text strong>{rateLabel}</Typography.Text>
          <Segmented<number>
            value={appliedRate}
            disabled={waiting || resolve.isPending || !upholds}
            onChange={setRate}
            options={COMPENSATION_RATES.map((value) => ({ value, label: `${value}%` }))}
          />
          {ruling && !upholds && (
            <Typography.Text type="secondary">Chỉ chọn tỷ lệ khi bên bị khiếu nại có lỗi.</Typography.Text>
          )}
        </div>

        <Descriptions column={1} size="small" bordered title="Chia tiền đang giữ">
          <Descriptions.Item label="Tiền đang giữ">{formatMoney(split.frozen)}</Descriptions.Item>
          {split.compensation > 0 && (
            <Descriptions.Item label="Bồi thường từ cọc">{formatMoney(split.compensation)}</Descriptions.Item>
          )}
          {lateFee > 0 && <Descriptions.Item label="Phí trả trễ (từ cọc)">{formatMoney(lateFee)}</Descriptions.Item>}
          <Descriptions.Item label="Chủ đồ nhận">{formatMoney(split.owner)}</Descriptions.Item>
          <Descriptions.Item label="Người thuê nhận">{formatMoney(split.renter)}</Descriptions.Item>
          <Descriptions.Item label="Phí nền tảng">{formatMoney(split.platform)}</Descriptions.Item>
        </Descriptions>

        <div className="flex flex-col gap-2">
          <label htmlFor={noteId}>
            <Typography.Text strong>Lý do gửi cho hai bên</Typography.Text>
          </label>
          <Input.TextArea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={DECISION_MAX}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
            disabled={waiting || resolve.isPending}
            status={noteError ? 'error' : undefined}
            placeholder="VD: Ảnh lúc trả cho thấy càng xe bị gãy, ảnh lúc nhận thì còn nguyên vẹn."
          />
          {noteError && <Typography.Text type="danger">{noteError}</Typography.Text>}
        </div>

        <Button
          type="primary"
          className="self-start"
          icon={<SafetyCertificateOutlined />}
          loading={resolve.isPending}
          disabled={waiting}
          onClick={submit}
        >
          Ra phán quyết
        </Button>
      </div>
    </Card>
  )
}
