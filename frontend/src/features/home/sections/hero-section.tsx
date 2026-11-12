import { Search, Sparkles } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { browseToysPath } from '../../../routes/paths'
import type { ListingType } from '../../toy-listings/toy-listing-api'
import { HeroBannerCarousel } from '../components/hero-banner-carousel'
import {
  HERO_BANNER_SLIDES,
  HERO_CONTENT,
  HERO_SEARCH_ANCHOR_ID,
  HERO_SEARCH_MODES,
  TRUST_POINTS,
} from '../home-content'
import { homeButton } from '../home-styles'

const HERO_BACKGROUND =
  'bg-site-hero bg-[image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(160deg,var(--color-site-hero),var(--color-site-hero-deep))] bg-[length:20px_20px,100%_100%]'

export function HeroSection() {
  return (
    <section
      className={`relative overflow-hidden pt-10 pb-6 text-white sm:pt-14 sm:pb-8 ${HERO_BACKGROUND}`}
      aria-labelledby="home-hero-title"
    >
      <div className="home-container grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex animate-rise-in flex-col gap-5">
          <p className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-white/15">
            <Sparkles className="size-3.5 text-site-highlight-bright" aria-hidden /> {HERO_CONTENT.eyebrow}
          </p>
          <h1
            id="home-hero-title"
            className="text-4xl leading-[1.1] font-bold tracking-[-0.02em] sm:text-5xl lg:text-[56px]"
          >
            {HERO_CONTENT.titleLead}
            <span className="block text-site-hero-accent">{HERO_CONTENT.titleHighlight}</span>
          </h1>
          <p className="max-w-xl text-base leading-7 text-white/75">{HERO_CONTENT.lead}</p>
          <HeroSearch />
        </div>

        <HeroBannerCarousel slides={HERO_BANNER_SLIDES} label="Dịch vụ của ToyFlow" />
      </div>

      <ul className="home-container mt-10 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-xs text-white/75 sm:text-sm lg:grid-cols-4">
        {TRUST_POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-site-hero-accent" aria-hidden /> {text}
          </li>
        ))}
      </ul>
    </section>
  )
}

function HeroSearch() {
  const navigate = useNavigate()
  const inputId = useId()
  const modeName = useId()
  const [mode, setMode] = useState<ListingType>(HERO_SEARCH_MODES[0].value)
  const [keyword, setKeyword] = useState('')
  const activeMode = HERO_SEARCH_MODES.find((option) => option.value === mode) ?? HERO_SEARCH_MODES[0]

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate(browseToysPath({ type: mode, q: keyword.trim() }))
  }

  return (
    <form role="search" id={HERO_SEARCH_ANCHOR_ID} className="flex max-w-xl flex-col gap-3" onSubmit={handleSubmit}>
      <fieldset className="flex gap-1 self-start rounded-xl bg-white/10 p-1 ring-1 ring-white/15">
        <legend className="sr-only">{HERO_CONTENT.searchModesLabel}</legend>
        {HERO_SEARCH_MODES.map((option) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,color] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white ${
              option.value === mode
                ? 'bg-white text-site-hero shadow-sm hover:text-site-hero dark:bg-night-900 dark:text-white'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <input
              type="radio"
              name={modeName}
              value={option.value}
              checked={option.value === mode}
              onChange={() => setMode(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className="relative flex items-center gap-2 rounded-2xl bg-white p-2 shadow-[0_20px_40px_-20px_rgb(18_23_31/0.5)] dark:bg-night-900">
        <label htmlFor={inputId} className="sr-only">
          {HERO_CONTENT.searchLabel}
        </label>
        <Search className="pointer-events-none ml-2 size-5 shrink-0 text-tf-ink-muted" aria-hidden />
        <input
          id={inputId}
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={activeMode.placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-base text-site-ink placeholder:text-tf-ink-muted focus:outline-none sm:text-sm dark:text-white"
          autoComplete="off"
        />
        <button type="submit" className={homeButton('primary')}>
          {HERO_CONTENT.searchLabel}
        </button>
      </div>
    </form>
  )
}
