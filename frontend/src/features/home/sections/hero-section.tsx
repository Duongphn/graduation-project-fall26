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

export function HeroSection() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-container home-hero__grid">
        <div className="home-hero__copy">
          <p className="home-hero__eyebrow">
            <Sparkles aria-hidden /> {HERO_CONTENT.eyebrow}
          </p>
          <h1 id="home-hero-title" className="home-hero__title">
            {HERO_CONTENT.titleLead}
            <span className="home-hero__title-highlight">{HERO_CONTENT.titleHighlight}</span>
          </h1>
          <p className="home-hero__lead">{HERO_CONTENT.lead}</p>
          <HeroSearch />
        </div>

        <HeroBannerCarousel slides={HERO_BANNER_SLIDES} label="Dịch vụ của ToyFlow" />
      </div>

      <ul className="home-container home-hero__trust">
        {TRUST_POINTS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon aria-hidden /> {text}
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
    <form role="search" id={HERO_SEARCH_ANCHOR_ID} className="home-hero__search-block" onSubmit={handleSubmit}>
      <fieldset className="hero-search-modes">
        <legend className="sr-only">{HERO_CONTENT.searchModesLabel}</legend>
        {HERO_SEARCH_MODES.map((option) => (
          <label key={option.value} className={`hero-search-modes__option ${option.value === mode ? 'is-active' : ''}`}>
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

      <div className="home-hero__search">
        <label htmlFor={inputId} className="sr-only">
          {HERO_CONTENT.searchLabel}
        </label>
        <Search className="home-hero__search-icon" aria-hidden />
        <input
          id={inputId}
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={activeMode.placeholder}
          className="home-hero__search-input"
          autoComplete="off"
        />
        <button type="submit" className="home-button home-button--primary">
          {HERO_CONTENT.searchLabel}
        </button>
      </div>
    </form>
  )
}
