import { useEffect } from 'react'

import { PageHeader } from '../../../components/common'
import { adminHomeCrumb } from '../../../routes/paths'
import { NotificationsPanel } from '../components/NotificationsPanel'

/** Thông báo của Admin (UC26): khiếu nại, yêu cầu quyên góp cho tổ chức, cảnh báo hệ thống */
export function AdminNotificationsPage() {
  useEffect(() => {
    document.title = 'Thông báo | Quản trị ToyFlow'
  }, [])

  return (
    <>
      <PageHeader title="Thông báo" breadcrumb={[adminHomeCrumb, { title: 'Thông báo' }]} />
      <NotificationsPanel />
    </>
  )
}
