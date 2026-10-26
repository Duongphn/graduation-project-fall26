import { RotateCcw, SendHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AI_CHAT_CONTENT, AI_CHAT_MAX_LENGTH } from '../../ai-chat/ai-chat-content'
import { RobotMascot } from '../../ai-chat/components/robot-mascot'
import { useAdvisorChat } from '../../ai-chat/hooks/use-advisor-chat'
import { AI_ADVISOR_ANCHOR_ID, AI_ADVISOR_CONTENT } from '../home-content'

/**
 * Thẻ "Hỏi AI tư vấn" — chat diễn ra NGAY TRONG THẺ:
 * - Giới thiệu: robot + tiêu đề + câu gợi ý; đáy thẻ là thanh chat (ô nhập + nút mũi tên gửi).
 * - Đang chat (sau câu hỏi đầu tiên): đầu thẻ thu gọn, khung tin nhắn giãn lấp hết phần giữa thẻ,
 *   thanh chat giữ nguyên ở đáy.
 */
export function AiAdvisorCard() {
  const chat = useAdvisorChat()
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const isChatting = chat.messages.length > 0

  // Luôn cuộn tới tin mới nhất trong khung tin nhắn
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [chat.messages, chat.isPending])

  const ask = (text: string) => {
    if (!text.trim()) return
    chat.send(text)
    setDraft('')
    inputRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    ask(draft)
  }

  const restart = () => {
    chat.reset()
    setDraft('')
    inputRef.current?.focus()
  }

  return (
    <aside
      id={AI_ADVISOR_ANCHOR_ID}
      className={`ai-advisor ${isChatting ? 'is-chatting' : ''}`}
      aria-labelledby="home-ai-title"
    >
      {isChatting ? (
        <header className="ai-advisor__chat-header">
          <span className="ai-advisor__avatar" aria-hidden>
            <RobotMascot mood={chat.isPending ? 'happy' : 'awake'} />
          </span>
          <div className="ai-advisor__chat-heading">
            <h2 id="home-ai-title" className="ai-advisor__chat-title">
              {AI_CHAT_CONTENT.assistantName}
            </h2>
            <p className="ai-advisor__chat-status">{AI_CHAT_CONTENT.chatStatus}</p>
          </div>
          <button type="button" className="ai-advisor__restart" onClick={restart}>
            <RotateCcw aria-hidden /> {AI_CHAT_CONTENT.restartLabel}
          </button>
        </header>
      ) : (
        <>
          {/* Robot trợ lý: vòng sáng + lơ lửng nhẹ (tắt khi bật "giảm chuyển động") */}
          <div className="ai-advisor__robot" aria-hidden>
            <span className="ai-advisor__robot-glow" />
            <RobotMascot mood="awake" className="ai-advisor__robot-svg" />
            <Sparkles className="ai-advisor__sparkle ai-advisor__sparkle--1" />
            <Sparkles className="ai-advisor__sparkle ai-advisor__sparkle--2" />
          </div>

          <p className="ai-advisor__badge">
            <Sparkles aria-hidden /> {AI_ADVISOR_CONTENT.badge}
          </p>
          <h2 id="home-ai-title" className="ai-advisor__title">
            {AI_ADVISOR_CONTENT.titleLead}
            <span className="ai-advisor__highlight">{AI_ADVISOR_CONTENT.titleHighlight}</span>
          </h2>
          <p className="ai-advisor__text">{AI_ADVISOR_CONTENT.description}</p>

          <div className="ai-advisor__prompts">
            <span className="ai-advisor__prompts-label">{AI_ADVISOR_CONTENT.examplePromptsLabel}</span>
            {AI_ADVISOR_CONTENT.examplePrompts.map((prompt) => (
              <button key={prompt} type="button" className="ai-advisor__prompt" onClick={() => ask(prompt)}>
                “{prompt}”
              </button>
            ))}
          </div>
        </>
      )}

      {isChatting && (
        // tabIndex: thanh cuộn đã ẩn → cho khung nhận focus để cuộn bằng phím mũi tên
        <div
          ref={logRef}
          className="ai-advisor__log"
          role="log"
          aria-live="polite"
          aria-label="Hội thoại với Robo"
          tabIndex={0}
        >
          <p className="ai-bubble ai-bubble--assistant">{AI_CHAT_CONTENT.greeting}</p>
          {chat.messages.map((message) => (
            <p
              key={message.id}
              className={`ai-bubble ai-bubble--${message.role} ${message.isError ? 'ai-bubble--error' : ''}`}
            >
              {message.text}
            </p>
          ))}
          {chat.isPending && (
            <p className="ai-bubble ai-bubble--assistant">
              <span className="sr-only">{AI_CHAT_CONTENT.thinking}</span>
              <span aria-hidden className="ai-typing">
                <span />
                <span />
                <span />
              </span>
            </p>
          )}
        </div>
      )}

      {/* Đáy thẻ: thanh chat (ô nhập + nút mũi tên gửi) — dùng chung cho màn giới thiệu và khi đang chat */}
      <form className="ai-advisor__form" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="sr-only">
          {isChatting ? AI_CHAT_CONTENT.inputLabel : AI_ADVISOR_CONTENT.inputLabel}
        </label>
        <div className="ai-advisor__field">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            maxLength={AI_CHAT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={isChatting ? AI_CHAT_CONTENT.inputPlaceholder : AI_ADVISOR_CONTENT.inputPlaceholder}
            className="ai-advisor__input"
            autoComplete="off"
          />
          <button
            type="submit"
            className="ai-advisor__send"
            aria-label={AI_CHAT_CONTENT.sendLabel}
            disabled={!draft.trim() || chat.isPending}
          >
            <SendHorizontal aria-hidden />
          </button>
        </div>
        <p className="ai-advisor__disclaimer">{AI_CHAT_CONTENT.disclaimer}</p>
      </form>
    </aside>
  )
}
