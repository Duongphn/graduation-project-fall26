import { Breadcrumb, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  breadcrumb?: Array<{ title: string; to?: string }>
  // Buttons shown on the right, e.g. "Thêm danh mục".
  actions?: ReactNode
}

export function PageHeader({ title, description, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <Breadcrumb
            className="mb-2"
            items={breadcrumb.map((item) => ({
              title: item.to ? <Link to={item.to}>{item.title}</Link> : item.title,
            }))}
          />
        )}
        <Typography.Title level={3} className="!mb-1">
          {title}
        </Typography.Title>
        {description && <Typography.Text type="secondary">{description}</Typography.Text>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
