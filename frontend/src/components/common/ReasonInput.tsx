import { Input, Tag, Typography } from 'antd'

import { REASON_MAX } from '../../schemas/common'

export type ReasonPresetMode = 'replace' | 'append'

const SEPARATOR = '; '

interface ReasonInputProps {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  // Ready-made reasons shown as tags above the text box (feature content, e.g. constants.ts).
  presets?: readonly string[]
  // replace: a tag replaces the text; append: tags are added/removed, joined with "; ".
  presetMode?: ReasonPresetMode
  placeholder?: string
  disabled?: boolean
}

const splitReasons = (text: string): string[] =>
  text
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean)

// Reason text box with optional quick-pick presets; the text always stays editable.
export function ReasonInput({
  value = '',
  onChange,
  onBlur,
  presets = [],
  presetMode = 'replace',
  placeholder = 'Nhập lý do để người dùng biết cần sửa gì…',
  disabled,
}: ReasonInputProps) {
  const chosen = presetMode === 'append' ? splitReasons(value) : [value.trim()]

  const toggle = (preset: string, checked: boolean) => {
    if (presetMode === 'replace') {
      onChange?.(checked ? preset : '')
      return
    }
    const parts = splitReasons(value).filter((part) => part !== preset)
    onChange?.((checked ? [...parts, preset] : parts).join(SEPARATOR))
  }

  return (
    <div className="flex flex-col gap-2">
      {presets.length > 0 && (
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-sm">
            Lý do thường gặp
          </Typography.Text>
          <div className="flex flex-wrap gap-y-2">
            {presets.map((preset) => (
              <Tag.CheckableTag
                key={preset}
                checked={chosen.includes(preset)}
                onChange={(checked) => !disabled && toggle(preset, checked)}
              >
                {preset}
              </Tag.CheckableTag>
            ))}
          </div>
        </div>
      )}
      <Input.TextArea
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={onBlur}
        rows={4}
        maxLength={REASON_MAX}
        showCount
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}
