import { Button, DatePicker, Select, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { z } from 'zod'

import { DataTable, FilterBar, PageHeader } from '../../../components/common'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb } from '../../../routes/paths'
import { objectIdParam } from '../../../schemas/list-params'
import { dayjs, inVietnam, VN_TIME_ZONE } from '../../../utils/dayjs'
import { formatDateTime, formatMoney } from '../../../utils/format'
import { matchesWithoutTones } from '../../../utils/text'
import {
  auditActionLabel,
  auditAreaLabels,
  auditDetailLabels,
  auditDetailValueLabels,
  auditTargetLabels,
} from '../constants'
import { useAuditLogFilterOptions, useAuditLogs } from '../hooks'
import type { AuditLogItem } from '../types'

// Filters kept in the URL (?actorId=…&action=toy&from=…&to=…). Broken values are ignored.
const isoParam = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)))
  .optional()
  .catch(undefined)

const filtersSchema = z.object({
  actorId: objectIdParam,
  action: z
    .string()
    .regex(/^[a-z_]+(\.[a-z_]+)?$/)
    .optional()
    .catch(undefined),
  from: isoParam,
  to: isoParam,
})

// The filter lists find a typed text without accents, case or extra spaces
// ("khoa tai khoan" and "  khóa  " both find "Khóa tài khoản").
const filterByLabel = (input: string, option?: { label?: unknown }) =>
  matchesWithoutTones(input, option?.label)

// The time range is in Vietnam days (00:00–23:59 UTC+7), the days shown in the table, whatever
// the device time zone. The picker shows that day as a plain local date.
const vietnamDay = (day: Dayjs) => dayjs.tz(day.format('YYYY-MM-DD'), VN_TIME_ZONE)
const pickerDay = (iso: string) => dayjs(inVietnam(iso).format('YYYY-MM-DD'))

const formatValue = (key: string, value: string | number | boolean | null): string => {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (key === 'until' && typeof value === 'string') return formatDateTime(value)
  if (key === 'amount' && typeof value === 'number') return formatMoney(value)
  return auditDetailValueLabels[key]?.[String(value)] ?? String(value)
}

function AuditDetails({ details }: { details: AuditLogItem['details'] }) {
  if (!details) return <Typography.Text type="secondary">—</Typography.Text>
  return (
    <div className="flex max-w-96 flex-col gap-0.5">
      {Object.entries(details).map(([key, value]) => (
        <Typography.Text key={key} className="text-xs" ellipsis={{ tooltip: true }}>
          <Typography.Text type="secondary" className="text-xs">
            {auditDetailLabels[key] ?? key}:
          </Typography.Text>{' '}
          {formatValue(key, value)}
        </Typography.Text>
      ))}
    </div>
  )
}

const columns: TableColumnsType<AuditLogItem> = [
  {
    title: 'Thời gian',
    key: 'createdAt',
    width: 150,
    render: (_, item) => inVietnam(item.createdAt).format('HH:mm:ss DD/MM/YYYY'),
  },
  {
    title: 'Người thực hiện',
    key: 'actor',
    render: (_, item) =>
      item.actor ? (
        (item.actor.fullName ?? item.actor.id)
      ) : (
        <Tag className="m-0">Hệ thống</Tag>
      ),
  },
  {
    title: 'Thao tác',
    key: 'action',
    render: (_, item) => (
      <div className="flex flex-col">
        <span>{auditActionLabel(item.action)}</span>
        <Typography.Text type="secondary" className="text-xs">
          {item.action}
        </Typography.Text>
      </div>
    ),
  },
  {
    title: 'Đối tượng',
    key: 'target',
    render: (_, item) => (
      <div className="flex flex-col">
        <span>{auditTargetLabels[item.targetType] ?? item.targetType}</span>
        {item.targetId && (
          <Typography.Text type="secondary" className="text-xs" copyable={{ text: item.targetId }}>
            …{item.targetId.slice(-6)}
          </Typography.Text>
        )}
      </div>
    ),
  },
  {
    title: 'Chi tiết',
    key: 'details',
    render: (_, item) => <AuditDetails details={item.details} />,
  },
  {
    title: 'IP',
    key: 'ipAddress',
    render: (_, item) => item.ipAddress ?? '—',
  },
]

// UC31: the log of important actions (approvals, locks, setting changes…), newest first.
// Read-only: entries cannot be changed or deleted.
export function AuditLogPage() {
  const { params, filters, setPage, setFilter, setFilters, reset } = useListParams({
    schema: filtersSchema,
    defaultLimit: 20,
  })
  const logs = useAuditLogs(params)
  const options = useAuditLogFilterOptions()

  const areas = [...new Set((options.data?.actions ?? []).map((action) => action.split('.')[0] ?? action))]
  const actionOptions = [
    {
      label: 'Theo nhóm',
      options: areas.map((area) => ({ value: area, label: `${auditAreaLabels[area] ?? area} (tất cả)` })),
    },
    {
      label: 'Theo thao tác',
      options: (options.data?.actions ?? []).map((action) => ({
        value: action,
        label: auditActionLabel(action),
      })),
    },
  ]
  const hasFilters = Boolean(filters.actorId || filters.action || filters.from || filters.to)

  return (
    <>
      <PageHeader
        title="Nhật ký hệ thống"
        description="Các thao tác quan trọng của Admin và hệ thống: ai làm, làm gì, khi nào. Chỉ xem, không thể sửa hoặc xóa (UC31)."
        breadcrumb={[adminHomeCrumb, { title: 'Nhật ký hệ thống' }]}
      />

      <FilterBar
        extra={
          hasFilters && (
            <Button type="link" onClick={reset}>
              Xóa bộ lọc
            </Button>
          )
        }
      >
        <Select<string>
          allowClear
          showSearch={{ filterOption: filterByLabel }}
          placeholder="Người thực hiện"
          aria-label="Người thực hiện"
          className="w-56"
          loading={options.isLoading}
          value={filters.actorId}
          options={(options.data?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.fullName }))}
          onChange={(value) => setFilter('actorId', value)}
        />
        <Select<string>
          allowClear
          showSearch={{ filterOption: filterByLabel }}
          placeholder="Loại thao tác"
          aria-label="Loại thao tác"
          className="w-72"
          loading={options.isLoading}
          value={filters.action}
          options={actionOptions}
          onChange={(value) => setFilter('action', value)}
        />
        <DatePicker.RangePicker
          aria-label="Khoảng thời gian"
          format="DD/MM/YYYY"
          placeholder={['Từ ngày', 'Đến ngày']}
          value={[
            filters.from ? pickerDay(filters.from) : null,
            filters.to ? pickerDay(filters.to) : null,
          ]}
          onChange={(range) =>
            setFilters({
              from: range?.[0] ? vietnamDay(range[0]).toISOString() : undefined,
              to: range?.[1] ? vietnamDay(range[1]).endOf('day').toISOString() : undefined,
            })
          }
        />
      </FilterBar>

      <DataTable<AuditLogItem>
        items={logs.data?.items}
        pagination={logs.data?.pagination}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        loading={logs.isFetching}
        columns={columns}
        onPageChange={setPage}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Chưa có thao tác nào phù hợp.' }}
      />
    </>
  )
}
