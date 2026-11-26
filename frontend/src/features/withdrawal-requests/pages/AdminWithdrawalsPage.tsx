import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Alert, App, Button, Descriptions, Space, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { DataTable, PageHeader, ReasonModal, RelativeTime, StatusTabs, StatusTag, UserSummary } from '../../../components/common'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDateTime, formatMoney } from '../../../utils/format'
import { useProcessWithdrawal, useWithdrawalCounts, useWithdrawals } from '../hooks'
import { WITHDRAWAL_REJECT_PRESETS, withdrawalFiltersSchema } from '../schemas'
import type { AdminWithdrawal } from '../types'

const TAB_STATUSES = ['pending', 'completed', 'rejected'] as const

/** Ngân hàng, số tài khoản (sao chép được), chủ tài khoản: đủ để Admin chuyển khoản */
function BankDetails({ item }: { item: AdminWithdrawal }) {
  return (
    <div className="flex flex-col">
      <Typography.Text strong>{item.bankInfo.bankName}</Typography.Text>
      <Typography.Text copyable={{ text: item.bankInfo.accountNumber }} className="tabular-nums">
        {item.bankInfo.accountNumber}
      </Typography.Text>
      <Typography.Text type="secondary" className="text-xs">
        {item.bankInfo.accountHolderName}
      </Typography.Text>
    </div>
  )
}

/**
 * Duyệt rút tiền: Admin chuyển khoản cho người dùng theo thông tin trong hàng rồi bấm "Đã chuyển
 * khoản" (tiền rời ký quỹ), hoặc từ chối kèm lý do (tiền được hoàn vào ví người dùng). Lệnh chờ
 * xử lý xếp cũ trước (đến trước chuyển trước). Server chỉ xử lý lệnh còn chờ, nên hai Admin bấm
 * cùng lúc thì một người nhận 409 và danh sách được tải lại.
 */
export function AdminWithdrawalsPage() {
  const { modal } = App.useApp()
  const { params, filters, setPage, setFilter } = useListParams({ schema: withdrawalFiltersSchema })
  const withdrawals = useWithdrawals(params)
  const counts = useWithdrawalCounts()
  const [rejecting, setRejecting] = useState<AdminWithdrawal>()
  const process = useProcessWithdrawal({ onSuccess: () => setRejecting(undefined) })
  const isPending = filters.status === 'pending'

  const confirmTransferred = (item: AdminWithdrawal) =>
    modal.confirm({
      title: 'Xác nhận đã chuyển khoản?',
      width: 520,
      content: (
        <div className="flex flex-col gap-3">
          <Typography.Paragraph className="!mb-0">
            Chỉ bấm xác nhận sau khi đã chuyển tiền thành công từ tài khoản ToyFlow. Thao tác này không hoàn tác được.
          </Typography.Paragraph>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Số tiền">
              <Typography.Text strong>{formatMoney(item.amount)}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Ngân hàng">{item.bankInfo.bankName}</Descriptions.Item>
            <Descriptions.Item label="Số tài khoản">{item.bankInfo.accountNumber}</Descriptions.Item>
            <Descriptions.Item label="Chủ tài khoản">{item.bankInfo.accountHolderName}</Descriptions.Item>
            {item.code && <Descriptions.Item label="Nội dung chuyển khoản">TOYFLOW {item.code}</Descriptions.Item>}
          </Descriptions>
        </div>
      ),
      okText: 'Đã chuyển khoản',
      cancelText: 'Xem lại',
      onOk: () => process.mutateAsync({ id: item.id, input: { status: 'completed' } }).catch(() => undefined),
    })

  const columns: TableColumnsType<AdminWithdrawal> = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, item) => (
        <Link to={adminPaths.user(item.user.id)}>
          <UserSummary
            user={{ id: item.user.id, fullName: item.user.fullName ?? 'Người dùng', phone: item.user.phone, email: item.user.email }}
          />
        </Link>
      ),
    },
    {
      title: 'Số tiền',
      key: 'amount',
      align: 'right',
      render: (_, item) => (
        <Typography.Text strong className="tabular-nums">
          {formatMoney(item.amount)}
        </Typography.Text>
      ),
    },
    { title: 'Tài khoản nhận', key: 'bank', render: (_, item) => <BankDetails item={item} /> },
    {
      title: 'Mã lệnh',
      key: 'code',
      render: (_, item) =>
        item.code ? (
          <Typography.Text copyable={{ text: `TOYFLOW ${item.code}` }} className="text-xs">
            {item.code}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    { title: 'Gửi lúc', key: 'createdAt', render: (_, item) => <RelativeTime value={item.createdAt} /> },
    ...(isPending
      ? []
      : [
          {
            title: 'Kết quả',
            key: 'result',
            render: (_: unknown, item: AdminWithdrawal) => (
              <div className="flex max-w-64 flex-col items-start gap-1">
                <StatusTag domain="withdrawal" status={item.status} />
                {item.processedAt && (
                  <Typography.Text type="secondary" className="text-xs">
                    {formatDateTime(item.processedAt)}
                  </Typography.Text>
                )}
                {item.status === 'rejected' && item.notes && (
                  <Typography.Paragraph type="secondary" className="!mb-0 text-xs" ellipsis={{ rows: 2, tooltip: true }}>
                    Lý do: {item.notes}
                  </Typography.Paragraph>
                )}
              </div>
            ),
          },
        ]),
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) =>
        item.status === 'pending' ? (
          <Space wrap>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => confirmTransferred(item)}>
              Đã chuyển khoản
            </Button>
            <Button danger icon={<CloseOutlined />} onClick={() => setRejecting(item)}>
              Từ chối
            </Button>
          </Space>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Duyệt rút tiền"
        description="Chuyển khoản cho người dùng đúng số tiền và tài khoản bên dưới, ghi nội dung là mã lệnh, rồi bấm “Đã chuyển khoản”. Từ chối thì số tiền được hoàn lại vào ví người dùng."
        breadcrumb={[adminHomeCrumb, { title: 'Duyệt rút tiền' }]}
      />

      <StatusTabs
        domain="withdrawal"
        statuses={TAB_STATUSES}
        value={filters.status === 'all' ? undefined : filters.status}
        counts={counts.data}
        onChange={(next) => setFilter('status', next ?? 'all')}
      />

      {isPending && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          title="Lệnh gửi trước nằm trên đầu. Tài khoản đang bị khóa thì không chuyển tiền được, chỉ có thể từ chối để hoàn tiền vào ví."
        />
      )}

      <DataTable<AdminWithdrawal>
        items={withdrawals.data?.items}
        pagination={withdrawals.data?.pagination}
        error={withdrawals.error}
        onRetry={() => void withdrawals.refetch()}
        loading={withdrawals.isFetching}
        columns={columns}
        onPageChange={setPage}
        scroll={{ x: 1000 }}
        locale={{ emptyText: isPending ? 'Không có lệnh rút nào đang chờ chuyển khoản.' : 'Không có lệnh rút nào.' }}
      />

      <ReasonModal
        open={Boolean(rejecting)}
        title={rejecting ? `Từ chối lệnh rút ${formatMoney(rejecting.amount)}` : 'Từ chối lệnh rút'}
        okText="Từ chối và hoàn tiền"
        label="Lý do (người dùng sẽ thấy lý do này; số tiền được hoàn vào ví)"
        presets={WITHDRAWAL_REJECT_PRESETS}
        loading={process.isPending}
        onCancel={() => setRejecting(undefined)}
        // The modal stays open on an error, so the typed reason is kept.
        onSubmit={(reason) => {
          if (rejecting) process.mutate({ id: rejecting.id, input: { status: 'rejected', notes: reason } })
        }}
      />
    </>
  )
}
