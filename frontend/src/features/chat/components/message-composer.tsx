import { ImagePlus, LoaderCircle, SendHorizontal, X } from 'lucide-react'
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { OutgoingMessage } from '../hooks/use-chat-room'
import { useChatAttachments } from '../hooks/use-chat-attachments'
import { CHAT_IMAGE_TYPES, CHAT_IMAGES_MAX, CHAT_TEXT_MAX, validateChatMessage } from '../chat-schema'

interface MessageComposerProps {
  onSend: (message: OutgoingMessage) => void
}

/**
 * Ô soạn tin: chữ (≤ 1000 ký tự, có bộ đếm) và tối đa 5 ảnh JPG/PNG/WebP ≤ 5 MB.
 * Enter gửi, Shift+Enter xuống dòng; đang gõ tiếng Việt (bộ gõ chưa chốt chữ) thì Enter không gửi.
 */
export function MessageComposer({ onSend }: MessageComposerProps) {
  const inputId = useId()
  const fileId = useId()
  const errorId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const attachments = useChatAttachments()
  const full = attachments.items.length >= CHAT_IMAGES_MAX
  const overLimit = text.length > CHAT_TEXT_MAX
  const canSend =
    !attachments.uploading &&
    !attachments.failed &&
    !overLimit &&
    (text.trim().length > 0 || attachments.readyCount > 0)

  const submit = () => {
    if (attachments.uploading) {
      setError('Ảnh đang tải lên, chờ một chút rồi gửi.')
      return
    }
    // Không gửi thiếu ảnh mà người dùng tưởng đã đính kèm
    if (attachments.failed) {
      setError('Có ảnh tải lên không thành công. Bỏ ảnh lỗi rồi gửi lại.')
      return
    }
    const problem = validateChatMessage(text, attachments.readyCount)
    if (problem) {
      setError(problem)
      return
    }
    onSend({ text, ...attachments.take() })
    setText('')
    setError(null)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  const errors = [...(error ? [error] : []), ...attachments.rejections]

  return (
    <form className="chat-composer" onSubmit={handleSubmit} aria-label="Soạn tin nhắn">
      {attachments.items.length > 0 && (
        <ul className="chat-composer__attachments" aria-label="Ảnh đính kèm">
          {attachments.items.map((item, index) => (
            <li key={item.key} className={`chat-composer__thumb is-${item.status}`}>
              <img src={item.previewUrl} alt={`Ảnh đính kèm ${index + 1}`} />
              {item.status === 'uploading' && (
                <span className="chat-composer__progress" role="progressbar" aria-label={`Đang tải ảnh ${index + 1}`} aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                  {item.progress}%
                </span>
              )}
              {item.status === 'error' && (
                <span className="chat-composer__thumb-error" title={item.error}>
                  Lỗi
                </span>
              )}
              <button
                type="button"
                className="chat-composer__remove"
                onClick={() => attachments.remove(item.key)}
                aria-label={`Bỏ ảnh ${index + 1}`}
              >
                <X aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="chat-composer__row">
        <input
          id={fileId}
          type="file"
          multiple
          accept={CHAT_IMAGE_TYPES.join(',')}
          className="sr-only"
          disabled={full}
          onChange={(event) => {
            if (event.target.files) void attachments.addFiles(event.target.files)
            event.target.value = '' // chọn lại được đúng ảnh vừa bỏ
          }}
        />
        <label
          htmlFor={fileId}
          className={`chat-composer__attach ${full ? 'is-disabled' : ''}`}
          title={full ? `Tối đa ${CHAT_IMAGES_MAX} ảnh mỗi tin nhắn` : 'Gửi ảnh (JPG, PNG, WebP, tối đa 5 MB)'}
        >
          <ImagePlus aria-hidden />
          <span className="sr-only">Đính kèm ảnh</span>
        </label>

        <div className="chat-composer__field">
          <label htmlFor={inputId} className="sr-only">
            Nội dung tin nhắn
          </label>
          <textarea
            id={inputId}
            rows={1}
            value={text}
            placeholder="Nhập tin nhắn…"
            aria-invalid={overLimit || undefined}
            aria-describedby={errors.length > 0 ? errorId : undefined}
            onChange={(event) => {
              setText(event.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleKeyDown}
            className="chat-composer__input"
          />
          <span className={`chat-composer__counter ${overLimit ? 'is-over' : ''}`} aria-live="polite">
            {text.length}/{CHAT_TEXT_MAX}
          </span>
        </div>

        <button type="submit" className="chat-composer__send" disabled={!canSend} aria-label="Gửi tin nhắn">
          {attachments.uploading ? <LoaderCircle aria-hidden className="animate-spin" /> : <SendHorizontal aria-hidden />}
        </button>
      </div>

      {errors.length > 0 && (
        <ul id={errorId} className="chat-composer__errors" role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </form>
  )
}
