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

/** Nền navy có ánh sáng ở hai góc */
const CARD_BACKGROUND =
  'bg-[image:radial-gradient(120%_80%_at_100%_0%,rgb(20_40_75/0.35),transparent_60%),radial-gradient(90%_70%_at_0%_100%,rgb(168_133_79/0.18),transparent_60%),linear-gradient(150deg,#20396a,var(--color-site-night))]'

/**
 * Class thay đổi theo chế độ. Đang chat: thẻ gọn lại, thanh chat nhỏ hơn và sát đáy.
 * `lg:[contain:size]`: trên desktop, nội dung thẻ không được tính vào chiều cao hàng lưới, nên thẻ
 * cao đúng bằng lưới độ tuổi bên cạnh; khung tin nhắn (flex-1) lấp phần giữa và tự cuộn.
 */
const MODE_CLASSES = {
  intro: {
    card: 'gap-3 p-6 sm:p-7',
    form: 'gap-2.5 pt-2',
    field: 'rounded-2xl p-1.5',
    input: 'h-10 px-3 text-base sm:text-sm',
    send: 'size-10 rounded-xl [&_svg]:size-[18px]',
    disclaimer: 'text-[11px]',
  },
  chatting: {
    card: 'gap-0 px-6 pt-6 pb-3 sm:px-7 sm:pt-7 sm:pb-3.5 lg:[contain:size]',
    form: 'gap-1.5 pt-3',
    field: 'rounded-xl p-1',
    input: 'h-9 px-2.5 text-base sm:text-[13px]',
    send: 'size-9 rounded-lg [&_svg]:size-4',
    disclaimer: 'text-[10px]',
  },
}

const BUBBLE = 'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap'
const ASSISTANT_BUBBLE = `${BUBBLE} self-start rounded-bl-md bg-white/10 text-white/90`

/** Bong bóng tin nhắn: người dùng bên phải (vàng), Robo bên trái; tin lỗi có viền vàng nhạt */
function bubbleClass(role: 'user' | 'assistant', isError?: boolean) {
  const position = role === 'user' ? 'self-end rounded-br-md font-medium' : 'self-start rounded-bl-md'
  const colors = isError
    ? 'border border-tf-tertiary-fixed/40 bg-tf-accent/15 text-tf-tertiary-fixed'
    : role === 'user'
      ? 'bg-site-highlight-bright text-site-ink'
      : 'bg-white/10 text-white/90'
  return `${BUBBLE} ${position} ${colors}`
}

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
  const mode = MODE_CLASSES[isChatting ? 'chatting' : 'intro']

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
      className={`relative isolate flex scroll-mt-24 flex-col overflow-hidden rounded-3xl text-white shadow-[0_30px_60px_-30px_rgb(20_40_75/0.9)] ${CARD_BACKGROUND} ${mode.card}`}
      aria-labelledby="home-ai-title"
    >
      {isChatting ? (
        <header className="flex items-center gap-3 border-b border-white/10 pb-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 p-1 ring-1 ring-white/15"
            aria-hidden
          >
            <RobotMascot mood={chat.isPending ? 'happy' : 'awake'} className="size-full" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="home-ai-title" className="text-base leading-5 font-bold">
              {AI_CHAT_CONTENT.assistantName}
            </h2>
            {/* Chấm xanh "đang hoạt động" vẽ bằng ::before */}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65 before:size-2 before:rounded-full before:bg-tf-secondary before:content-['']">
              {AI_CHAT_CONTENT.chatStatus}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none [&_svg]:size-3.5"
            onClick={restart}
          >
            <RotateCcw aria-hidden /> {AI_CHAT_CONTENT.restartLabel}
          </button>
        </header>
      ) : (
        <>
          {/* Robot trợ lý: vòng sáng + lơ lửng nhẹ (tắt khi bật "giảm chuyển động") */}
          <div
            className="pointer-events-none absolute top-3 right-1 size-32 animate-ai-robot-float sm:size-36"
            aria-hidden
          >
            <span className="absolute inset-4 -z-10 rounded-full bg-tf-primary-fixed/40 blur-2xl" />
            <RobotMascot mood="awake" className="size-full drop-shadow-[0_16px_24px_rgb(18_23_31/0.35)]" />
            <Sparkles className="absolute top-6 left-2 size-5 animate-ai-sparkle text-site-highlight-bright" />
            <Sparkles className="absolute right-6 bottom-4 size-3.5 animate-[ai-sparkle_2.4s_ease-in-out_1.2s_infinite] text-tf-primary-fixed" />
          </div>

          <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-tf-primary-fixed ring-1 ring-white/15">
            <Sparkles className="size-3.5 text-site-highlight-bright" aria-hidden /> {AI_ADVISOR_CONTENT.badge}
          </p>
          {/* Chừa chỗ bên phải cho robot */}
          <h2 id="home-ai-title" className="max-w-[62%] text-2xl leading-8 font-bold sm:max-w-[60%]">
            {AI_ADVISOR_CONTENT.titleLead}
            <span className="block text-site-highlight-bright">{AI_ADVISOR_CONTENT.titleHighlight}</span>
          </h2>
          <p className="text-sm leading-6 text-white/75">{AI_ADVISOR_CONTENT.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/60">{AI_ADVISOR_CONTENT.examplePromptsLabel}</span>
            {AI_ADVISOR_CONTENT.examplePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-site-highlight-bright hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-site-highlight-bright focus-visible:outline-none"
                onClick={() => ask(prompt)}
              >
                “{prompt}”
              </button>
            ))}
          </div>
        </>
      )}

      {isChatting && (
        // Khung tin nhắn tràn sát hai mép thẻ (lề âm = padding ngang của thẻ), tự cuộn khi dài.
        // Desktop: h-0 + flex-1 để lấp chỗ trống mà không làm thẻ phình; mobile: cao cố định h-96.
        // Ẩn thanh cuộn, mép trên mờ dần; tabIndex để vẫn cuộn được bằng phím mũi tên.
        <div
          ref={logRef}
          className="-mx-6 flex h-96 flex-col gap-2 overflow-y-auto overscroll-contain bg-black/25 px-6 py-4 [mask-image:linear-gradient(to_bottom,transparent_0,#000_1.5rem)] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none sm:-mx-7 sm:px-7 lg:h-0 lg:min-h-0 lg:flex-1 [&::-webkit-scrollbar]:hidden"
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
      )}

      {/* Đáy thẻ: thanh chat (ô nhập + nút mũi tên gửi) — dùng chung cho màn giới thiệu và khi đang chat */}
      <form className={`mt-auto flex flex-col ${mode.form}`} onSubmit={handleSubmit}>
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
        <div
          className={`flex items-center gap-1.5 border border-white/15 bg-white/10 transition-[border-color,background-color] duration-200 focus-within:border-site-highlight-bright focus-within:bg-white/15 ${mode.field}`}
        >
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
            className={`min-w-0 flex-1 bg-transparent text-white placeholder:text-white/50 focus:outline-none ${mode.input}`}
            autoComplete="off"
          />
          <button
            type="submit"
            className={`grid shrink-0 cursor-pointer place-items-center bg-site-highlight-bright text-site-ink shadow-[0_6px_16px_-8px_rgb(168_133_79/0.9)] transition-[background-color,transform,opacity] duration-200 hover:bg-tf-accent focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:scale-95 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50 disabled:shadow-none ${mode.send}`}
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
        <p className={`text-center text-white/55 ${mode.disclaimer}`}>{AI_CHAT_CONTENT.disclaimer}</p>
      </form>
    </aside>
  )
}
