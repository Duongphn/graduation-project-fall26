import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Card, Form, Input, Popconfirm, Radio } from 'antd'
import { useForm, useWatch } from 'react-hook-form'

import { FormField } from '../../../components/common'
import { lockDurations, type ReportAction } from '../../../constants/domain'
import { lockDurationLabels, reportActionLabels } from '../../../constants/labels'
import { useResolveReport } from '../hooks'
import { NOTE_MAX, resolveFormSchema, type ResolveFormValues } from '../schemas'
import type { ReportDetail } from '../types'

interface ResolveReportCardProps {
  report: ReportDetail
}

const confirmText: Record<ReportAction, string> = {
  dismiss: 'Bỏ qua báo cáo này?',
  remove_listing: 'Gỡ tin đăng bị báo cáo?',
  warn: 'Gửi cảnh cáo cho người bị báo cáo?',
  lock: 'Khóa tài khoản người bị báo cáo?',
}

// UC29: dismiss, remove the listing (toy reports), warn or lock 7 days / 30 days / permanently.
export function ResolveReportCard({ report }: ResolveReportCardProps) {
  const mutation = useResolveReport()
  const { control, handleSubmit } = useForm<ResolveFormValues>({
    resolver: zodResolver(resolveFormSchema),
    defaultValues: { action: 'dismiss', note: '' },
  })
  const action = useWatch({ control, name: 'action' })
  const reportedLocked = report.reportedUser?.accountStatus === 'LOCKED'

  const actions = (['dismiss', 'remove_listing', 'warn', 'lock'] as const).filter(
    (value) =>
      (value !== 'remove_listing' || report.target.kind === 'toy') &&
      (value === 'dismiss' || value === 'remove_listing' || report.reportedUser?.role === 'USER') &&
      (value !== 'lock' || !reportedLocked),
  )

  const submit = handleSubmit(({ action: chosen, lockDuration, note }) =>
    mutation.mutate({
      id: report.id,
      input: { action: chosen, note, ...(chosen === 'lock' && lockDuration ? { lockDuration } : {}) },
    }),
  )

  return (
    <Card title="Xử lý báo cáo">
      <Form layout="vertical" onFinish={() => void submit()}>
        <FormField control={control} name="action" label="Cách xử lý" required>
          {(field) => (
            <Radio.Group
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              options={actions.map((value) => ({ value, label: reportActionLabels[value] }))}
              optionType="button"
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        {action === 'lock' && (
          <FormField control={control} name="lockDuration" label="Thời hạn khóa" required>
            {(field) => (
              <Radio.Group
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                options={lockDurations.map((value) => ({ value, label: lockDurationLabels[value] }))}
                disabled={mutation.isPending}
              />
            )}
          </FormField>
        )}
        <FormField
          control={control}
          name="note"
          label={action === 'dismiss' ? 'Ghi chú' : 'Lý do gửi người dùng'}
          required
          extra={action === 'lock' ? 'Từ 20 đến 300 ký tự.' : 'Từ 5 đến 300 ký tự.'}
        >
          {(field) => (
            <Input.TextArea {...field} rows={3} showCount maxLength={NOTE_MAX} disabled={mutation.isPending} />
          )}
        </FormField>
        {report.otherPendingReports > 0 && (
          <Alert
            className="mb-4"
            type="info"
            showIcon
            title={`${report.otherPendingReports} báo cáo khác đang chờ về cùng đối tượng sẽ được xử lý cùng lúc.`}
          />
        )}
        {action === 'lock' && (
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            title="Tin đang hiển thị bị ẩn, phiên đăng nhập kết thúc và ví không rút được tiền. Đơn đang thực hiện vẫn tiếp tục, tiền đang giữ không mất."
          />
        )}
        <Popconfirm
          title={confirmText[action]}
          okText="Xác nhận"
          cancelText="Huỷ"
          onConfirm={() => void submit()}
        >
          <Button type="primary" danger={action !== 'dismiss'} loading={mutation.isPending}>
            Xác nhận
          </Button>
        </Popconfirm>
      </Form>
    </Card>
  )
}
