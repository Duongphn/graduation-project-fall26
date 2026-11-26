import { Button, Result } from 'antd'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import { PATHS } from './paths'

// Error element of the admin area: the no-permission page (R03 V.2 MSG59) for a signed-in User
// who opens /admin, shown without the admin menu (C7). Other errors go on to the next boundary.
export function AdminRouteError() {
  const error = useRouteError()
  if (!isRouteErrorResponse(error) || error.status !== 403) throw error
  return (
    <Result
      status="403"
      title="403"
      subTitle="Bạn không có quyền mở trang này."
      extra={
        <Link to={PATHS.home}>
          <Button type="primary">Về trang chủ</Button>
        </Link>
      }
    />
  )
}
