import { RotateCcw, SendHorizontal, SlidersHorizontal, X } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { PATHS } from '../../../routes/paths'
import { EMPTY_ADVISOR_FILTERS } from '../advisor-filters'
import { AI_CHAT_CONTENT, AI_CHAT_MAX_LENGTH } from '../ai-chat-content'
import type { AdvisorFilters } from '../ai-chat-api'
import { useAdvisorChat } from '../hooks/use-advisor-chat'
import { AdvisorFilterPanel } from './advisor-filter-panel'
import { AdvisorToyList } from './advisor-toy-card'
import { RobotMascot } from './robot-mascot'

const BUBBLE = 'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap'
const ASSISTANT_BUBBLE = `${BUBBLE} self-start rounded-bl-md bg-white/10 text-white/90`

function bubbleClass(role: 'user' | 'assistant', isError?: boolean) {
  const position = role === 'user' ? 'self-end rounded-br-md font-medium' : 'self-start rounded-bl-md'
  const colors = isError
    ? 'border border-tf-tertiary-fixed/40 bg-tf-accent/15 text-tf-tertiary-fixed'
    : role === 'user'
      ? 'bg-site-highlight-bright text-site-ink'
      : 'bg-white/10 text-white/90'
  return `${BUBBLE} ${position} ${colors}`
}

const ICON_BUTTON =
  'grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none'

/**
 * Trợ lý AI dạng nút nổi góc phải (R03: màn danh sách đồ chơi). Bấm nút để mở khung chat Robo;
 * cùng hook hội thoại với thẻ "Hỏi AI tư vấn" trên trang chủ. Esc hoặc nút X để đóng.
 */
export function AdvisorFloatingChat() {
  const chat = useAdvisorChat()
  const isSignedIn = useIsSignedIn()
  const location = useLocation()
  const panelId = useId()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Mở khung thì đưa con trỏ vào ô nhập
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Luôn cuộn tới tin mới nhất
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [chat.messages, chat.isPending, open])

  const close = () => {
    setOpen(false)
    setShowFilters(false)
    toggleRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim()) return
    chat.send(draft)
    setDraft('')
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

  const loginPath = `${PATHS.login}?redirect=${encodeURIComponent(location.pathname + location.search)}`

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-label={`Trợ lý AI ${AI_CHAT_CONTENT.assistantName}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
          className="flex h-[min(36rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#20396a,var(--color-site-night))] text-white shadow-[0_30px_60px_-20px_rgb(20_40_75/0.8)]"
        >
          <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 p-1 ring-1 ring-white/15"
              aria-hidden
            >
              <RobotMascot mood={chat.isPending ? 'happy' : 'awake'} className="size-full" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base leading-5 font-bold">{AI_CHAT_CONTENT.assistantName}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65 before:size-2 before:rounded-full before:bg-tf-secondary before:content-['']">
                {AI_CHAT_CONTENT.chatStatus}
              </p>
            </div>
            {chat.messages.length > 0 && (
              <button
                type="button"
                className={ICON_BUTTON}
                onClick={restart}
                aria-label={AI_CHAT_CONTENT.restartLabel}
                title={AI_CHAT_CONTENT.restartLabel}
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              className={ICON_BUTTON}
              onClick={close}
              aria-label={AI_CHAT_CONTENT.closeLabel}
              title={AI_CHAT_CONTENT.closeLabel}
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          {/* tabIndex: cuộn được bằng phím mũi tên khi thanh cuộn bị ẩn */}
          <div
            ref={logRef}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain bg-black/20 px-4 py-4 [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
            role="log"
            aria-live="polite"
            aria-label="Hội thoại với Robo"
            tabIndex={0}
          >
            <p className={ASSISTANT_BUBBLE}>{AI_CHAT_CONTENT.greeting}</p>
            {chat.messages.map((message) => (
              <Fragment key={message.id}>
                <p className={bubbleClass(message.role, message.isError)}>{message.text}</p>
                {message.toys && message.toys.length > 0 && <AdvisorToyList toys={message.toys} />}
              </Fragment>
            ))}
            {chat.isPending && (
              <p className={ASSISTANT_BUBBLE}>
                <span className="sr-only">{AI_CHAT_CONTENT.thinking}</span>
                <span aria-hidden className="flex gap-1 py-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-white/60" />
                  <span className="size-1.5 animate-[bounce_1s_120ms_infinite] rounded-full bg-white/60" />
                  <span className="size-1.5 animate-[bounce_1s_240ms_infinite] rounded-full bg-white/60" />
                </span>
              </p>
            )}
          </div>

          <form className="flex flex-col gap-2 px-4 pt-3 pb-3" onSubmit={handleSubmit}>
            {showFilters && (
              <AdvisorFilterPanel
                initial={chat.filters ?? EMPTY_ADVISOR_FILTERS}
                disabled={chat.isPending}
                onApply={applyFilters}
                onClose={() => setShowFilters(false)}
              />
            )}
            <label htmlFor={inputId} className="sr-only">
              {AI_CHAT_CONTENT.inputLabel}
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 p-1 transition-[border-color,background-color] duration-200 focus-within:border-site-highlight-bright focus-within:bg-white/15">
              <button
                type="button"
                aria-label={AI_CHAT_CONTENT.filterToggleLabel}
                aria-expanded={showFilters}
                title={AI_CHAT_CONTENT.filterToggleLabel}
                onClick={() => setShowFilters((value) => !value)}
                className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${
                  showFilters ? 'bg-white/25 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
              </button>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                value={draft}
                maxLength={AI_CHAT_MAX_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={AI_CHAT_CONTENT.inputPlaceholder}
                className="h-9 min-w-0 flex-1 bg-transparent px-2 text-base text-white placeholder:text-white/50 focus:outline-none sm:text-sm"
                autoComplete="off"
              />
              <button
                type="submit"
                aria-label={AI_CHAT_CONTENT.sendLabel}
                disabled={!draft.trim() || chat.isPending}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-site-highlight-bright text-site-ink transition-[background-color,transform] duration-200 hover:bg-tf-accent focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-95 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50"
              >
                <SendHorizontal className="size-4" aria-hidden />
              </button>
            </div>
            {!isSignedIn && (
              <p className="text-center text-xs text-white/80">
                {AI_CHAT_CONTENT.loginHint}{' '}
                <Link
                  to={loginPath}
                  className="font-semibold text-site-highlight-bright underline-offset-2 hover:underline"
                >
                  {AI_CHAT_CONTENT.loginLink}
                </Link>
              </p>
            )}
            <p className="text-center text-[10px] text-white/55">{AI_CHAT_CONTENT.disclaimer}</p>
          </form>
        </section>
      )}

      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? AI_CHAT_CONTENT.closeLabel : AI_CHAT_CONTENT.openAriaLabel}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-14 cursor-pointer items-center gap-2 rounded-full bg-site-night py-2 pr-5 pl-2 font-semibold text-white shadow-[0_14px_30px_-12px_rgb(20_40_75/0.8)] ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-site-highlight-bright focus-visible:outline-none active:scale-95"
      >
        <span className="grid size-10 place-items-center rounded-full bg-white/10 p-1" aria-hidden>
          {open ? <X className="size-5" /> : <RobotMascot mood="awake" className="size-full" />}
        </span>
        <span className="text-sm">{open ? 'Đóng' : AI_CHAT_CONTENT.openLabel}</span>
      </button>
    </div>
  )
}
