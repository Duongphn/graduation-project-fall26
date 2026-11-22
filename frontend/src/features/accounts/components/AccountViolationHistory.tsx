import { Empty, Table, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { ReportReason, ReportTargetKind } from '../../../constants/domain'
import {
  reportActionLabels,
  reportReasonLabels,
  reportTargetKindLabels,
} from '../../../constants/labels'
import { adminPaths } from '../../../routes/paths'
import { formatDate, formatMoney } from '../../../utils/format'
import { rulingLabel } from '../../disputes/ruling'
import type { AccountViolation } from '../types'

const withNote = (main: string, note: string | null): ReactNode => (
  <div className="flex flex-col">
    <span>{main}</span>
    {note && (
      <Typography.Text type="secondary" className="text-xs">
        {note}
      </Typography.Text>
    )}
  </div>
)

// Where the breach comes from; a report and a dispute open their Admin page. The Admin has no
// rental order page, so a late return shows the order code only. One Admin decision that closed
// several reports on the same target is one row (one violation).
const source = (row: AccountViolation): ReactNode => {
  if (row.source === 'report') {
    const kind = reportTargetKindLabels[row.targetKind as ReportTargetKind]?.toLowerCase() ?? ''
    return (
      <div className="flex flex-col">
        <Link to={adminPaths.violationReport(row.id)}>Báo cáo {kind}</Link>
        {row.reportCount > 1 && (
          <Typography.Text type="secondary" className="text-xs">
            Xử lý cùng lúc {row.reportCount} báo cáo
          </Typography.Text>
        )}
      </div>
    )
  }
  if (row.source === 'dispute') {
    return <Link to={adminPaths.dispute(row.id)}>Khiếu nại đơn {row.orderCode}</Link>
  }
  return `Trả trễ đơn ${row.orderCode}`
}

const content = (row: AccountViolation): string => {
  if (row.source === 'report') return reportReasonLabels[row.reason as ReportReason] ?? row.reason
  if (row.source === 'dispute') return rulingLabel(row.ruling)
  return `Trả trễ ${row.lateDays} ngày`
}

const outcome = (row: AccountViolation): ReactNode => {
  if (row.source === 'report') return withNote(row.action ? reportActionLabels[row.action] : '—', row.note)
  if (row.source === 'dispute') return withNote('Phán quyết của Admin', row.note)
  return `Phí trả trễ ${formatMoney(row.lateFee)}`
}

// R03 III.7.2.1 (7): every recorded breach with its date and source (a violation report, a
// dispute ruling or a late return), newest first.
export function AccountViolationHistory({ violations }: { violations: AccountViolation[] }) {
  if (violations.length === 0) return <Empty description="Chưa có vi phạm nào." />
  return (
    <Table<AccountViolation>
      rowKey={(row) => `${row.source}-${row.id}`}
      size="small"
      pagination={false}
      dataSource={violations}
      columns={[
        { title: 'Ngày', key: 'date', render: (_, row) => formatDate(row.date) },
        { title: 'Nguồn', key: 'source', render: (_, row) => source(row) },
        { title: 'Nội dung', key: 'content', render: (_, row) => content(row) },
        { title: 'Xử lý', key: 'outcome', render: (_, row) => outcome(row) },
      ]}
    />
  )
}
