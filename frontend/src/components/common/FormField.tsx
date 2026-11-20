import { Form } from 'antd'
import { cloneElement, useId } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useController } from 'react-hook-form'
import type { Control, ControllerRenderProps, FieldPath, FieldValues } from 'react-hook-form'

interface FormFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  name: TName
  label?: ReactNode
  required?: boolean
  extra?: ReactNode
  // Renders the antd input, e.g. (field) => <Input {...field} />.
  children: (field: ControllerRenderProps<TValues, TName>) => ReactElement
}

// One react-hook-form field inside an antd Form.Item: the label, the required mark and the
// error message (from zod or set with setError after a server error) are wired automatically.
// The label points at the input (htmlFor + id): screen readers announce it and a click on the
// label focuses the input. A child that sets its own id keeps it.
export function FormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed = TValues,
>({ control, name, label, required, extra, children }: FormFieldProps<TValues, TName, TTransformed>) {
  const { field, fieldState } = useController({ control, name })
  const autoId = useId()
  const child = children(field) as ReactElement<{ id?: string }>
  const id = child.props.id ?? `${autoId}${name.replace(/[^\w-]/g, '-')}`
  return (
    <Form.Item
      label={label}
      htmlFor={label ? id : undefined}
      required={required}
      extra={extra}
      validateStatus={fieldState.error ? 'error' : undefined}
      help={fieldState.error?.message}
    >
      {cloneElement(child, { id })}
    </Form.Item>
  )
}
