import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Card, Descriptions, Input, Radio, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { FormField, FormModal } from '../../../components/common'
import { lockDurationLabels } from '../../../constants/labels'
import { adminPaths } from '../../../routes/paths'
import { toneColors } from '../../../styles/status'
import { formatDateTime, formatMoney } from '../../../utils/format'
import { useTrustDecision } from '../hooks'
import {
  ACCOUNT_REASON_MAX,
  trustLockFormSchema,
  trustReasonFormSchema,
  type TrustDecisionFormValues,
} from '../schemas'
import type { AccountDetail, TrustDecisionAction } from '../types'
import { TrustBlockTag } from './TrustBlockTag'

const decisionLabels: Record<TrustDecisionAction, string> = {
  lift: 'Gỡ chặn',
  keep: 'Giữ chặn',
  lock: 'Khóa tài khoản',
}

interface TrustBlockCardProps {
  account: AccountDetail
}

// R03 BF-02 2a, UC29 (FE-09), screen 47: a Renter refused for a low Trust Score waits here for
// the Admin, who lifts the block, keeps it or locks the account, always with a reason.
export function TrustBlockCard({ account }: TrustBlockCardProps) {
  const [action, setAction] = useState<TrustDecisionAction | null>(null)
  const { trustBlock } = account
  const { review, lift, lastDecision } = trustBlock
  if (account.role === 'ADMIN') return null
  if (!review && !lift && !lastDecision && !trustBlock.blocked) return null

  const score = account.trustScore ?? 100
  const locked = account.accountStatus === 'LOCKED'
  // Without an open review, "keep" puts back the block an Admin lifted.
  const keepLabel = review ? 'Giữ chặn' : 'Áp dụng lại chặn'

  const status = review ? (
    <TrustBlockTag status="review" />
  ) : lift ? (
    <TrustBlockTag status="lifted" />
  ) : (
    <Tag color={toneColors.error} className="m-0">
      Đang chặn thuê đồ cọc cao
    </Tag>
  )

  return (
    <Card title="Chặn thuê do Trust Score">
      {/* The state sits in the body: in the narrow column a tag beside the title cuts the title. */}
      <div className="mb-3">{status}</div>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'score', label: 'Điểm tin cậy hiện tại', children: `${score} (ngưỡng ${trustBlock.threshold})` },
          { key: 'limit', label: 'Áp dụng với đồ cọc trên', children: formatMoney(trustBlock.depositLimit) },
        ]}
      />

      {review && (
        <div className="mt-4">
          <Typography.Text strong>Yêu cầu xem xét</Typography.Text>
          <Descriptions
            className="mt-2"
            column={1}
            size="small"
            items={[
              { key: 'attempts', label: 'Số lần bị chặn', children: review.attemptCount },
              { key: 'first', label: 'Bị chặn lần đầu', children: formatDateTime(review.requestedAt) },
              { key: 'last', label: 'Bị chặn gần nhất', children: formatDateTime(review.lastBlockedAt) },
              {
                key: 'toy',
                label: 'Đồ chơi muốn thuê',
                children: review.toy ? (
                  <Link to={adminPaths.toy(review.toy.id)}>{review.toy.title ?? 'Tin đăng đã bị xóa'}</Link>
                ) : (
                  '—'
                ),
              },
              { key: 'deposit', label: 'Tiền cọc của đồ chơi', children: formatMoney(review.depositPrice) },
              {
                key: 'atBlock',
                label: 'Lúc bị chặn',
                children: `Điểm ${review.score}, ngưỡng ${review.threshold}, mức cọc ${formatMoney(review.depositLimit)}`,
              },
            ]}
          />
        </div>
      )}

      {lift && (
        <Alert
          className="mt-4"
          type="success"
          showIcon
          title="Đã gỡ chặn Trust Score"
          description={
            <div className="flex flex-col gap-1">
              <span>
                {formatDateTime(lift.liftedAt)}
                {lift.liftedBy?.fullName ? ` bởi ${lift.liftedBy.fullName}` : ''}.
              </span>
              <span>Lý do: {lift.reason}</span>
              <span>Còn hiệu lực khi điểm tin cậy từ {lift.score} trở lên; điểm thấp hơn thì chặn áp dụng lại.</span>
            </div>
          }
        />
      )}

      {!review && !lift && lastDecision && (
        <Alert
          className="mt-4"
          type="info"
          showIcon
          title={`Quyết định gần nhất: ${decisionLabels[lastDecision.action]}`}
          description={
            <div className="flex flex-col gap-1">
              <span>
                {formatDateTime(lastDecision.decidedAt)}
                {lastDecision.decidedBy?.fullName ? ` bởi ${lastDecision.decidedBy.fullName}` : ''}, điểm lúc đó{' '}
                {lastDecision.score}.
              </span>
              <span>Lý do: {lastDecision.reason}</span>
              {lastDecision.action === 'keep' && (
                <span>Lần bị chặn sau chỉ đưa Renter vào danh sách xem xét khi điểm tin cậy đã thay đổi.</span>
              )}
            </div>
          }
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(review || (!lift && trustBlock.blocked)) && (
          <Button type="primary" onClick={() => setAction('lift')}>
            Gỡ chặn
          </Button>
        )}
        {(review || lift) && (
          <Button danger onClick={() => setAction('keep')}>
            {keepLabel}
          </Button>
        )}
        {review && !locked && (
          <Button danger type="primary" onClick={() => setAction('lock')}>
            Khóa tài khoản
          </Button>
        )}
      </div>

      {action && (
        <TrustDecisionModal
          account={account}
          action={action}
          keepLabel={keepLabel}
          onClose={() => setAction(null)}
        />
      )}
    </Card>
  )
}

interface TrustDecisionModalProps {
  account: AccountDetail
  action: TrustDecisionAction
  keepLabel: string
  onClose: () => void
}

// Confirmation dialog of one decision, with the reason sent to the Renter (and the lock length).
function TrustDecisionModal({ account, action, keepLabel, onClose }: TrustDecisionModalProps) {
  const mutation = useTrustDecision({ onSuccess: onClose })
  const { control, handleSubmit } = useForm<TrustDecisionFormValues>({
    resolver: zodResolver(action === 'lock' ? trustLockFormSchema : trustReasonFormSchema),
    defaultValues: action === 'lock' ? { reason: '', duration: '7d' } : { reason: '' },
  })
  const { depositLimit } = account.trustBlock
  const score = account.trustScore ?? 100

  const texts: Record<TrustDecisionAction, { title: string; okText: string; effect: string }> = {
    lift: {
      title: 'Gỡ chặn Trust Score?',
      okText: 'Gỡ chặn',
      effect:
        `Renter được đặt thuê đồ chơi có tiền cọc trên ${formatMoney(depositLimit)} dù điểm tin cậy là ${score}. ` +
        `Gỡ chặn còn hiệu lực khi điểm tin cậy không thấp hơn ${score}; điểm giảm thì chặn tự áp dụng lại.`,
    },
    keep: {
      title: `${keepLabel} Trust Score?`,
      okText: keepLabel,
      effect:
        `Renter vẫn không thuê được đồ chơi có tiền cọc trên ${formatMoney(depositLimit)} khi điểm tin cậy dưới ngưỡng. ` +
        'Lần bị chặn sau chỉ đưa Renter vào danh sách xem xét khi điểm tin cậy đã thay đổi.',
    },
    lock: {
      title: 'Khóa tài khoản này?',
      okText: 'Khóa tài khoản',
      effect:
        'Yêu cầu xem xét được đóng. Khi khóa: các tin đang hiển thị bị ẩn, phiên đăng nhập kết thúc và ví không rút được tiền. Đơn đang thực hiện vẫn tiếp tục, tiền đang giữ không mất.',
    },
  }
  const text = texts[action]

  const submit = handleSubmit(({ reason, duration }) => {
    if (mutation.isPending) return
    if (action === 'lock') {
      mutation.mutate({ id: account.id, action, duration: duration ?? '7d', reason })
    } else {
      mutation.mutate({ id: account.id, action, reason })
    }
  })

  return (
    <FormModal
      open
      title={text.title}
      okText={text.okText}
      danger={action !== 'lift'}
      loading={mutation.isPending}
      onCancel={onClose}
      onSubmit={() => void submit()}
    >
      <Alert className="mb-4" type={action === 'lift' ? 'info' : 'warning'} showIcon title={text.effect} />
      {action === 'lock' && (
        <FormField control={control} name="duration" label="Thời hạn khóa" required>
          {(field) => (
            <Radio.Group
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              options={(['7d', '30d', 'permanent'] as const).map((value) => ({
                value,
                label: lockDurationLabels[value],
              }))}
              optionType="button"
              disabled={mutation.isPending}
            />
          )}
        </FormField>
      )}
      <FormField
        control={control}
        name="reason"
        label="Lý do gửi người dùng"
        required
        extra="Từ 20 đến 300 ký tự. Người dùng nhận lý do qua thông báo và email."
      >
        {(field) => (
          <Input.TextArea
            {...field}
            rows={3}
            showCount
            maxLength={ACCOUNT_REASON_MAX}
            disabled={mutation.isPending}
            placeholder="Ví dụ: Đã xác minh qua điện thoại, người thuê có lịch sử trả đồ đúng hẹn."
          />
        )}
      </FormField>
    </FormModal>
  )
}
