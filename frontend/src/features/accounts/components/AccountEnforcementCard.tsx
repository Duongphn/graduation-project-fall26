import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Card, Form, Input, Popconfirm, Radio } from 'antd'
import { useForm, useWatch } from 'react-hook-form'

import { FormField } from '../../../components/common'
import { lockDurationLabels } from '../../../constants/labels'
import { useAccountAction } from '../hooks'
import {
  ACCOUNT_REASON_MAX,
  accountActionFormSchema,
  type AccountActionFormValues,
} from '../schemas'
import type { AccountDetail } from '../types'

interface AccountEnforcementCardProps {
  account: AccountDetail
}

// R03 III.7.2.1 (8)-(10): lock for 7 days, 30 days or permanently, or unlock, always with a
// reason sent to the user. An active account offers the locks, a locked one offers Unlock.
export function AccountEnforcementCard({ account }: AccountEnforcementCardProps) {
  const locked = account.accountStatus === 'LOCKED'
  const mutation = useAccountAction()
  const { control, handleSubmit } = useForm<AccountActionFormValues>({
    resolver: zodResolver(accountActionFormSchema),
    defaultValues: { action: locked ? 'unlock' : '7d', reason: '' },
  })
  const action = useWatch({ control, name: 'action' })

  if (account.role === 'ADMIN') {
    return (
      <Card title="Xử lý tài khoản">
        <Alert type="info" showIcon title="Không thể khóa tài khoản Admin." />
      </Card>
    )
  }

  const options = locked
    ? [{ value: 'unlock', label: 'Mở khóa' }]
    : (['7d', '30d', 'permanent'] as const).map((value) => ({ value, label: lockDurationLabels[value] }))

  // The page remounts this card when the account status changes (key), which clears the form.
  const submit = handleSubmit(({ action: chosen, reason }) =>
    mutation.mutate({ id: account.id, action: chosen, reason }),
  )

  return (
    <Card title="Xử lý tài khoản">
      <Form layout="vertical" onFinish={() => void submit()}>
        <FormField control={control} name="action" label="Thao tác" required>
          {(field) => (
            <Radio.Group
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              options={options}
              optionType="button"
              disabled={mutation.isPending}
            />
          )}
        </FormField>
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
              placeholder="Ví dụ: Nhiều lần đăng đồ chơi không an toàn sau khi đã bị cảnh cáo."
            />
          )}
        </FormField>
        {action !== 'unlock' && (
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            title="Khi khóa: các tin đang hiển thị bị ẩn, phiên đăng nhập kết thúc và ví không rút được tiền. Đơn đang thực hiện vẫn tiếp tục, tiền đang giữ không mất."
          />
        )}
        <Popconfirm
          title={action === 'unlock' ? 'Mở khóa tài khoản này?' : 'Khóa tài khoản này?'}
          okText="Xác nhận"
          cancelText="Huỷ"
          onConfirm={() => void submit()}
        >
          <Button type="primary" danger={action !== 'unlock'} loading={mutation.isPending}>
            Xác nhận
          </Button>
        </Popconfirm>
      </Form>
    </Card>
  )
}
