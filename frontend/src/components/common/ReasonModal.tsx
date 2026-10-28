import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { reasonFormSchema } from '../../schemas/common'
import type { ReasonFormValues } from '../../schemas/common'
import { FormField } from './FormField'
import { FormModal } from './FormModal'
import { ReasonInput } from './ReasonInput'
import type { ReasonPresetMode } from './ReasonInput'

interface ReasonModalProps {
  open: boolean
  title: string
  // Text of the confirm button, e.g. "Từ chối".
  okText?: string
  cancelText?: string
  label?: string
  placeholder?: string
  danger?: boolean
  loading?: boolean
  // Optional quick reasons (see ReasonInput); feature-specific lists live in the feature.
  presets?: readonly string[]
  presetMode?: ReasonPresetMode
  onCancel: () => void
  onSubmit: (reason: string) => void | Promise<void>
  // Optional context shown above the reason field, e.g. what the action will cost.
  children?: ReactNode
}

// The one modal that asks for a required reason (5–500 characters), used by every reject or
// hide action. Built on FormModal + FormField + ReasonInput and the shared reasonSchema.
export function ReasonModal({
  open,
  title,
  okText = 'Xác nhận',
  cancelText,
  label = 'Lý do',
  placeholder,
  danger = true,
  loading,
  presets,
  presetMode,
  onCancel,
  onSubmit,
  children,
}: ReasonModalProps) {
  const { control, handleSubmit, reset } = useForm<ReasonFormValues>({
    resolver: zodResolver(reasonFormSchema),
    defaultValues: { reason: '' },
  })

  useEffect(() => {
    if (open) reset({ reason: '' })
  }, [open, reset])

  return (
    <FormModal
      open={open}
      title={title}
      okText={okText}
      cancelText={cancelText}
      danger={danger}
      loading={loading}
      onCancel={onCancel}
      onSubmit={handleSubmit(({ reason }) => onSubmit(reason))}
    >
      {children}
      <FormField control={control} name="reason" label={label} required>
        {(field) => (
          <ReasonInput
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            presets={presets}
            presetMode={presetMode}
            placeholder={placeholder}
            disabled={loading}
          />
        )}
      </FormField>
    </FormModal>
  )
}
