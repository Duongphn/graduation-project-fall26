import { Table } from 'antd'
import type { TableProps } from 'antd'
import type { KeyboardEvent, MouseEvent } from 'react'

import type { PaginationMeta } from '../../types/api'
import { QueryErrorAlert } from './QueryErrorAlert'

interface DataTableProps<T> extends Omit<TableProps<T>, 'pagination' | 'dataSource'> {
  items: T[] | undefined
  pagination?: PaginationMeta
  error?: unknown
  onRetry?: () => void
  onPageChange?: (page: number, limit: number) => void
  // Opens a row on a single click or Enter (rows get focus with Tab). Clicks on the links and
  // buttons inside a row keep their own action.
  onRowOpen?: (row: T) => void
}

const fromInnerControl = (event: MouseEvent | KeyboardEvent) =>
  event.target instanceof Element &&
  event.target !== event.currentTarget &&
  event.target.closest('a, button, input, [role="button"]') !== null

// antd Table wired to the backend pagination envelope (page, limit, totalItems).
export function DataTable<T extends object>({
  items,
  pagination,
  error,
  onRetry,
  onPageChange,
  onRowOpen,
  rowKey = 'id',
  onRow,
  ...tableProps
}: DataTableProps<T>) {
  if (error) return <QueryErrorAlert error={error} onRetry={onRetry} />

  return (
    <Table<T>
      {...tableProps}
      rowKey={rowKey}
      onRow={
        onRowOpen
          ? (row, index) => ({
              ...onRow?.(row, index),
              tabIndex: 0,
              className: 'cursor-pointer',
              onClick: (event: MouseEvent) => {
                if (!fromInnerControl(event)) onRowOpen(row)
              },
              onKeyDown: (event: KeyboardEvent) => {
                if (event.key === 'Enter' && !fromInnerControl(event)) onRowOpen(row)
              },
            })
          : onRow
      }
      dataSource={items ?? []}
      scroll={{ x: 'max-content' }}
      pagination={
        pagination
          ? {
              current: pagination.page,
              pageSize: pagination.limit,
              total: pagination.totalItems,
              showSizeChanger: true,
              showTotal: (total) => `Tổng ${total} mục`,
              onChange: (page, pageSize) => onPageChange?.(page, pageSize),
            }
          : false
      }
    />
  )
}
