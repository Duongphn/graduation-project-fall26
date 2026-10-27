const vndFormatter = new Intl.NumberFormat('vi-VN')

/** 45000 → "45.000 ₫" */
export function formatVnd(amount: number): string {
  return `${vndFormatter.format(amount)} ₫`
}

/** Dùng cho InputNumber: hiển thị dấu chấm phân cách hàng nghìn kiểu Việt Nam */
export const vndInputFormatter = (value: number | string | undefined) =>
  value === undefined || value === '' ? '' : vndFormatter.format(Number(value))

export const vndInputParser = (value: string | undefined) => Number((value ?? '').replace(/\D/g, ''))
