import { RotateCcw, SendHorizontal, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { PATHS } from '../../../routes/paths'
import { EMPTY_ADVISOR_FILTERS } from '../../ai-chat/advisor-filters'
import { AI_CHAT_CONTENT, AI_CHAT_MAX_LENGTH } from '../../ai-chat/ai-chat-content'
import type { AdvisorFilters } from '../../ai-chat/ai-chat-api'
import { AdvisorFilterPanel } from '../../ai-chat/components/advisor-filter-panel'
import { AdvisorToyList } from '../../ai-chat/components/advisor-toy-card'
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
  const isSignedIn = useIsSignedIn()
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const [showFilters, setShowFilters] = useState(false)
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
    setShowFilters(false)
    inputRef.current?.focus()
  }

  const applyFilters = (filters: AdvisorFilters, label: string) => {
    chat.applyFilters(filters, label)
    setShowFilters(false)
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
            <Fragment key={message.id}>
              <p className={`ai-bubble ai-bubble--${message.role} ${message.isError ? 'ai-bubble--error' : ''}`}>
                {message.text}
              </p>
              {message.toys && message.toys.length > 0 && <AdvisorToyList toys={message.toys} />}
            </Fragment>
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
        {showFilters && (
          <AdvisorFilterPanel
            initial={chat.filters ?? EMPTY_ADVISOR_FILTERS}
            disabled={chat.isPending}
            onApply={applyFilters}
            onClose={() => setShowFilters(false)}
          />
        )}
        <label htmlFor={inputId} className="sr-only">
          {isChatting ? AI_CHAT_CONTENT.inputLabel : AI_ADVISOR_CONTENT.inputLabel}
        </label>
        <div className="ai-advisor__field">
          <button
            type="button"
            aria-label={AI_CHAT_CONTENT.filterToggleLabel}
            aria-expanded={showFilters}
            title={AI_CHAT_CONTENT.filterToggleLabel}
            onClick={() => setShowFilters((open) => !open)}
            className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${
              showFilters ? 'bg-white/25 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="size-[18px]" aria-hidden />
          </button>
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
        {!isSignedIn && (
          <p className="text-center text-xs text-white/80">
            {AI_CHAT_CONTENT.loginHint}{' '}
            <Link
              to={`${PATHS.login}?redirect=${encodeURIComponent(PATHS.home)}`}
              className="font-semibold text-site-highlight-bright underline-offset-2 hover:underline"
            >
              {AI_CHAT_CONTENT.loginLink}
            </Link>
          </p>
        )}
        <p className="ai-advisor__disclaimer">{AI_CHAT_CONTENT.disclaimer}</p>
      </form>
    </aside>
  )
}
