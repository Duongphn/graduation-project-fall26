import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, App, Button, Descriptions, Input, Popconfirm } from 'antd'
import { useCallback, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'

import { FormField, FormModal } from '../../../components/common'
import { useServerFieldErrors } from '../../../hooks/useServerFieldErrors'
import { ApiError } from '../../../services/api-error'
import { formatDateTime } from '../../../utils/format'
import { useResetSetting, useUpdateSetting } from '../hooks'
import { SETTING_NOTE_MAX, settingFormSchema, type SettingFormValues } from '../schemas'
import {
  formatSettingRange,
  formatSettingValue,
  parseSettingInput,
  toInputText,
} from '../setting-value'
import type { AdminSetting } from '../types'

interface SettingEditModalProps {
  setting: AdminSetting
  // Every setting: the withdrawal limits are checked against each other.
  settings: readonly AdminSetting[]
  onClose: () => void
}

export const GB38_NOTE =
  'Thay đổi chỉ áp dụng cho giao dịch tạo sau khi lưu (GB-38). Đơn, yêu cầu và lệnh rút đã tạo giữ giá trị cũ.'

const decimalsHint = (setting: AdminSetting) =>
  setting.decimals === 0
    ? 'Số nguyên.'
    : `Tối đa ${setting.decimals} chữ số thập phân, dùng dấu phẩy hoặc dấu chấm.`

// Setting Detail (UC30, screen 57): shows one setting and saves a new value after a confirmation,
// or sets it back to its default. Every save writes one audit log row with the old and new value.
export function SettingEditModal({ setting, settings, onClose }: SettingEditModalProps) {
  const { modal } = App.useApp()
  const schema = useMemo(() => settingFormSchema(setting, settings), [setting, settings])
  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { isDirty },
  } = useForm<SettingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { value: toInputText(setting.value), note: '' },
  })
  const applyFieldErrors = useServerFieldErrors(setError)
  // 404: the setting is gone from the catalogue (another version of the server). Close the form.
  const onServerError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        onClose()
        return false
      }
      return applyFieldErrors(error)
    },
    [applyFieldErrors, onClose],
  )
  const update = useUpdateSetting(onServerError)
  const reset = useResetSetting()
  // Set before validation: a double click or Enter while the confirmation is open sends nothing.
  const busyRef = useRef(false)
  const release = () => {
    busyRef.current = false
  }

  const onValid = (values: SettingFormValues) => {
    const parsed = parseSettingInput(setting, values.value)
    if (!parsed.ok) return release()
    const note = values.note.trim()
    modal.confirm({
      title: 'Lưu thay đổi cấu hình?',
      content: (
        <div className="flex flex-col gap-2">
          <span>
            {setting.label}: <strong>{formatSettingValue(setting, setting.value)}</strong> →{' '}
            <strong>{formatSettingValue(setting, parsed.value)}</strong>
          </span>
          <span>{setting.appliesTo}</span>
        </div>
      ),
      okText: 'Lưu',
      cancelText: 'Huỷ',
      onCancel: release,
      // Resolves either way, so the confirmation closes; an error is shown on the form.
      onOk: () =>
        new Promise<void>((resolve) => {
          update.mutate(
            { key: setting.key, value: parsed.value, ...(note ? { note } : {}) },
            {
              onSuccess: onClose,
              onSettled: () => {
                release()
                resolve()
              },
            },
          )
        }),
    })
  }

  const submit = () => {
    if (busyRef.current || update.isPending || reset.isPending) return
    busyRef.current = true
    void handleSubmit(onValid, release)()
  }

  const resetToDefault = () => {
    const note = getValues('note').trim()
    reset.mutate({ key: setting.key, ...(note ? { note } : {}) }, { onSuccess: onClose })
  }
  const canReset = !setting.isDefault || setting.invalidStoredValue !== null

  return (
    <FormModal
      open
      title={`Sửa cấu hình: ${setting.label}`}
      okText="Lưu"
      width={640}
      loading={update.isPending || reset.isPending}
      okDisabled={!isDirty && setting.invalidStoredValue === null}
      onCancel={onClose}
      onSubmit={submit}
    >
      <Descriptions
        size="small"
        column={1}
        className="mb-4"
        items={[
          { key: 'group', label: 'Nhóm', children: setting.groupLabel },
          { key: 'description', label: 'Ý nghĩa', children: setting.description },
          {
            key: 'value',
            label: 'Đang áp dụng',
            children: formatSettingValue(setting, setting.value),
          },
          {
            key: 'default',
            label: 'Mặc định',
            children: formatSettingValue(setting, setting.defaultValue),
          },
          { key: 'range', label: 'Khoảng cho phép', children: formatSettingRange(setting) },
          {
            key: 'updated',
            label: 'Cập nhật gần nhất',
            children: setting.updatedAt
              ? `${setting.updatedBy?.fullName ?? 'Admin'} · ${formatDateTime(setting.updatedAt)}`
              : 'Chưa thay đổi',
          },
        ]}
      />
      {setting.invalidStoredValue !== null && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          title={`Giá trị đang lưu "${setting.invalidStoredValue}" không hợp lệ nên hệ thống đang dùng giá trị mặc định. Lưu một giá trị mới hoặc đặt lại mặc định để sửa.`}
        />
      )}
      <Alert className="mb-4" type="info" showIcon title={GB38_NOTE} description={setting.appliesTo} />
      <FormField
        control={control}
        name="value"
        label={`Giá trị mới (${setting.unitLabel})`}
        required
        extra={`Từ ${formatSettingValue(setting, setting.min)} đến ${formatSettingValue(setting, setting.max)}. ${decimalsHint(setting)}`}
      >
        {(field) => (
          <Input
            {...field}
            inputMode={setting.decimals === 0 ? 'numeric' : 'decimal'}
            autoComplete="off"
            suffix={setting.unitLabel}
            autoFocus
          />
        )}
      </FormField>
      <FormField
        control={control}
        name="note"
        label="Ghi chú (không bắt buộc)"
        extra="Lý do thay đổi, ghi vào nhật ký hệ thống."
      >
        {(field) => <Input.TextArea {...field} rows={2} maxLength={SETTING_NOTE_MAX} showCount />}
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <span className="text-sm text-gray-500">
          Mặc định: {formatSettingValue(setting, setting.defaultValue)}
        </span>
        <Popconfirm
          title="Đặt lại giá trị mặc định?"
          description={`${setting.label} về ${formatSettingValue(setting, setting.defaultValue)}. Chỉ áp dụng cho giao dịch tạo sau khi lưu.`}
          okText="Đặt lại"
          cancelText="Huỷ"
          onConfirm={resetToDefault}
          disabled={!canReset}
        >
          <Button disabled={!canReset || update.isPending} loading={reset.isPending}>
            Đặt lại mặc định
          </Button>
        </Popconfirm>
      </div>
    </FormModal>
  )
}
