import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../services/api-error'
import { DataTable } from './DataTable'

interface Row {
  id: string
  name: string
}

const rows: Row[] = [
  { id: '1', name: 'Xe đạp' },
  { id: '2', name: 'Búp bê' },
]
const columns = [{ title: 'Tên', dataIndex: 'name' }]
const error = new ApiError(500, 'INTERNAL', 'Máy chủ đang bận.')

describe('DataTable', () => {
  it('keeps the previous rows on screen when a refetch fails, with the error above them', () => {
    render(<DataTable<Row> columns={columns} items={rows} error={error} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    const table = screen.getByRole('table')
    expect(within(table).getByText('Xe đạp')).toBeInTheDocument()
    expect(within(table).getByText('Búp bê')).toBeInTheDocument()
  })

  it('shows only the error when nothing was loaded yet', () => {
    render(<DataTable<Row> columns={columns} items={undefined} error={error} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the rows without an alert when there is no error', () => {
    render(<DataTable<Row> columns={columns} items={rows} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Xe đạp')).toBeInTheDocument()
  })
})
