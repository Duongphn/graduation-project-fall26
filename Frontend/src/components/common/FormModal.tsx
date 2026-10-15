import { Form, Modal } from 'antd'
import type { ReactNode } from 'react'

interface FormModalProps {
  open: boolean
  title: ReactNode
  // Text of the confirm button, e.g. "Lưu", "Thêm" or "Từ chối".
  okText?: string
  danger?: boolean
  loading?: boolean
  // Disables the confirm button, e.g. an edit form with no changes.
  okDisabled?: boolean
  width?: number
  onCancel: () => void
  // Usually react-hook-form's handleSubmit(onValid). Also runs when Enter is pressed in a field.
  onSubmit: () => void
  children: ReactNode
}

// A form inside a modal: vertical antd layout, OK/Huỷ footer, Enter submits, and the form is
// unmounted on close so it always opens fresh. Pair it with FormField for react-hook-form fields.
export function FormModal({
  open,
  title,
  okText = 'Lưu',
  danger,
  loading,
  okDisabled,
  width,
  onCancel,
  onSubmit,
  children,
}: FormModalProps) {
  // Enter in a field (hidden submit button) while saving or disabled is ignored, like the OK
  // button. onSubmit should still guard itself with a ref for the render before `loading`
  // (see CategoryFormModal).
  const guardedSubmit = () => {
    if (loading || okDisabled) return
    onSubmit()
  }
  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText="Huỷ"
      okButtonProps={{ danger, disabled: okDisabled }}
      confirmLoading={loading}
      // Cannot be closed (mask, Esc, X) while the request runs.
      mask={{ closable: !loading }}
      keyboard={!loading}
      closable={!loading}
      cancelButtonProps={{ disabled: loading }}
      width={width}
      onOk={guardedSubmit}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form layout="vertical" onFinish={guardedSubmit} className="pt-2">
        {children}
        {/* Lets the browser submit the form on Enter; the visible button is the modal's OK. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </Form>
    </Modal>
  )
}
