import { EditOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Skeleton, Table, Tag, Tooltip, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useSearchParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert } from '../../../components/common'
import { adminHomeCrumb } from '../../../routes/paths'
import { formatDateTime } from '../../../utils/format'
import { GB38_NOTE, SettingEditModal } from '../components/SettingEditModal'
import { useAdminSettings } from '../hooks'
import { formatSettingRange, formatSettingValue } from '../setting-value'
import type { AdminSetting, SettingGroup } from '../types'

// ?edit=<key> opens the Setting Detail of that key, so a refresh or a shared link keeps it open.
const EDIT_PARAM = 'edit'

const groupsOf = (settings: AdminSetting[]) => {
  const groups = new Map<SettingGroup, { label: string; items: AdminSetting[] }>()
  for (const setting of settings) {
    const group = groups.get(setting.group) ?? { label: setting.groupLabel, items: [] }
    group.items.push(setting)
    groups.set(setting.group, group)
  }
  return [...groups.entries()]
}

function ValueCell({ setting }: { setting: AdminSetting }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Typography.Text strong>{formatSettingValue(setting, setting.value)}</Typography.Text>
      {setting.invalidStoredValue !== null ? (
        <Tooltip title={`Giá trị đang lưu "${setting.invalidStoredValue}" không hợp lệ, hệ thống dùng mặc định.`}>
          <Tag color="warning" className="m-0">
            Giá trị lưu không hợp lệ
          </Tag>
        </Tooltip>
      ) : setting.isDefault ? (
        <Tag className="m-0">Mặc định</Tag>
      ) : (
        <Tag color="processing" className="m-0">
          Đã thay đổi
        </Tag>
      )}
    </div>
  )
}

// UC30 Configure System, Setting List (screen 56): fees, limits and time limits by group, with
// the value in use, the default and the last change. Toy categories have their own screen.
export function SystemSettingsPage() {
  const settingsQuery = useAdminSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const settings = settingsQuery.data ?? []
  const editKey = searchParams.get(EDIT_PARAM)
  const editing = settings.find((setting) => setting.key === editKey)

  const openEdit = (key: string) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set(EDIT_PARAM, key)
        return next
      },
      { replace: false },
    )
  const closeEdit = () =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(EDIT_PARAM)
        return next
      },
      { replace: true },
    )

  const columns: TableColumnsType<AdminSetting> = [
    {
      title: 'Cấu hình',
      key: 'label',
      render: (_, setting) => (
        <div className="flex max-w-xl flex-col">
          <Typography.Text strong>{setting.label}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {setting.description}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Đang áp dụng',
      key: 'value',
      width: 170,
      render: (_, setting) => <ValueCell setting={setting} />,
    },
    {
      title: 'Mặc định',
      key: 'default',
      width: 130,
      render: (_, setting) => formatSettingValue(setting, setting.defaultValue),
    },
    {
      title: 'Khoảng cho phép',
      key: 'range',
      width: 170,
      responsive: ['lg'],
      render: (_, setting) => formatSettingRange(setting),
    },
    {
      title: 'Thay đổi gần nhất',
      key: 'updated',
      width: 180,
      render: (_, setting) =>
        setting.updatedAt ? (
          <div className="flex flex-col">
            <span>{setting.updatedBy?.fullName ?? 'Admin'}</span>
            <Typography.Text type="secondary" className="text-xs">
              {formatDateTime(setting.updatedAt)}
            </Typography.Text>
          </div>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_, setting) => (
        <Button icon={<EditOutlined />} aria-label={`Sửa ${setting.label}`} onClick={() => openEdit(setting.key)}>
          Sửa
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Cấu hình hệ thống"
        description="Phí nền tảng, hoa hồng, hạn mức rút, ngưỡng Trust Score và các mốc thời gian (UC30). Danh mục đồ chơi quản lý ở mục Danh mục đồ chơi."
        breadcrumb={[adminHomeCrumb, { title: 'Cấu hình hệ thống' }]}
      />
      <Alert className="mb-4" type="info" showIcon title={GB38_NOTE} />

      {settingsQuery.isError && !settingsQuery.data ? (
        <QueryErrorAlert error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />
      ) : settingsQuery.isPending ? (
        <Skeleton active />
      ) : (
        <div className="flex flex-col gap-4">
          {groupsOf(settings).map(([group, { label, items }]) => (
            <Card key={group} title={label} size="small">
              <Table<AdminSetting>
                rowKey="key"
                columns={columns}
                dataSource={items}
                pagination={false}
                size="middle"
                aria-label={label}
              />
            </Card>
          ))}
        </div>
      )}

      {editing && (
        // A new key remounts the form with that setting's value.
        <SettingEditModal key={editing.key} setting={editing} settings={settings} onClose={closeEdit} />
      )}
    </>
  )
}
