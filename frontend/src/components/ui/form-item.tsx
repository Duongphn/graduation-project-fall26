import { Form } from 'antd'
import type { ReactNode } from 'react'
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

export interface FormControlProps {
  id: string
  status?: 'error'
  'aria-invalid': boolean
  'aria-describedby'?: string
}

interface FormItemProps<TValues extends FieldValues, TName extends FieldPath<TValues>, TContext, TTransformed> {
  control: Control<TValues, TContext, TTransformed>
  name: TName
  label?: ReactNode
  extra?: ReactNode
  children: (field: ControllerRenderProps<TValues, TName>, controlProps: FormControlProps) => ReactNode
}

/** react-hook-form + zod giữ state và validate; antd Form.Item chỉ hiển thị label và lỗi */
export function FormItem<TValues extends FieldValues, TName extends FieldPath<TValues>, TContext, TTransformed>({
  control,
  name,
  label,
  extra,
  children,
}: FormItemProps<TValues, TName, TContext, TTransformed>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message
        const errorId = `${name}-error`

        return (
          <Form.Item
            label={label}
            htmlFor={name}
            validateStatus={error ? 'error' : undefined}
            help={error && <span id={errorId}>{error}</span>}
            extra={extra}
          >
            {children(field, {
              id: name,
              status: error ? 'error' : undefined,
              'aria-invalid': !!error,
              'aria-describedby': error ? errorId : undefined,
            })}
          </Form.Item>
        )
      }}
    />
  )
}
