import { Alert, App, Button, Card, Input, Radio, Typography } from 'antd'
import { useState } from 'react'

import { TRUST_DECISION_LABELS, TRUST_REASON_MAX, TRUST_REASON_MIN } from '../format'
import { useTrustDecision } from '../hooks'
import type { TrustDecision } from '../types'

const HINTS: Record<TrustDecision, string> = {
  ALLOW: 'Người dùng được đặt thuê đồ cọc cao trong thời gian ân hạn (mặc định 30 ngày), kể cả khi điểm vẫn dưới ngưỡng.',
  KEEP_RESTRICTED: 'Người dùng vẫn bị chặn. Họ chỉ vào lại danh sách này khi điểm thay đổi.',
}

/** Quyết định cho một người dùng trong danh sách chờ: cho phép (ân hạn) hoặc giữ hạn chế, kèm lý do 10–500 ký tự */
export function TrustDecisionForm({ userId, fullName }: { userId: string; fullName: string }) {
  const { modal } = App.useApp()
  const [decision, setDecision] = useState<TrustDecision | null>(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const decide = useTrustDecision(userId)

  const reasonLength = reason.trim().length
  const errors = {
    decision: decision ? null : 'Chọn một quyết định.',
    reason:
      reasonLength < TRUST_REASON_MIN || reasonLength > TRUST_REASON_MAX
        ? `Lý do từ ${TRUST_REASON_MIN} đến ${TRUST_REASON_MAX} ký tự.`
        : null,
  }
  const show = (message: string | null) => (touched ? message : null)

  const submit = () => {
    setTouched(true)
    if (!decision || errors.reason) return
    modal.confirm({
      title: `${TRUST_DECISION_LABELS[decision]}?`,
      content: `${HINTS[decision]} ${fullName || 'Người dùng'} sẽ nhận thông báo kèm lý do của bạn.`,
      okText: TRUST_DECISION_LABELS[decision],
      okButtonProps: decision === 'KEEP_RESTRICTED' ? { danger: true } : {},
      cancelText: 'Xem lại',
      onOk: () => decide.mutateAsync({ decision, reason: reason.trim() }).catch(() => undefined),
    })
  }

  return (
    <Card title="Quyết định">
      <div className="flex flex-col gap-4">
        <div>
          <Radio.Group
            className="flex flex-col gap-3"
            value={decision}
            disabled={decide.isPending}
            onChange={(event) => setDecision(event.target.value as TrustDecision)}
          >
            {(['ALLOW', 'KEEP_RESTRICTED'] as const).map((value) => (
              <Radio key={value} value={value}>
                <span className="flex flex-col">
                  <Typography.Text strong>{TRUST_DECISION_LABELS[value]}</Typography.Text>
                  <Typography.Text type="secondary" className="text-xs">
                    {HINTS[value]}
                  </Typography.Text>
                </span>
              </Radio>
            ))}
          </Radio.Group>
          {show(errors.decision) && <Typography.Text type="danger">{errors.decision}</Typography.Text>}
        </div>

        <div>
          <Typography.Text strong>Lý do (người dùng sẽ thấy)</Typography.Text>
          <Input.TextArea
            className="!mt-2"
            value={reason}
            maxLength={TRUST_REASON_MAX}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            disabled={decide.isPending}
            status={show(errors.reason) ? 'error' : undefined}
            aria-label="Lý do quyết định"
            placeholder="VD: Hai lần huỷ đều do lỗi cổng thanh toán, các đánh giá gần đây tốt. Cho phép thuê thử."
            onChange={(event) => setReason(event.target.value)}
          />
          {show(errors.reason) && <Typography.Text type="danger">{errors.reason}</Typography.Text>}
        </div>

        <Alert type="info" showIcon message="Quyết định được ghi vào nhật ký quản trị và gửi thông báo cho người dùng." />

        <Button
          type="primary"
          danger={decision === 'KEEP_RESTRICTED'}
          block
          loading={decide.isPending}
          onClick={submit}
        >
          {decision ? TRUST_DECISION_LABELS[decision] : 'Gửi quyết định'}
        </Button>
      </div>
    </Card>
  )
}
