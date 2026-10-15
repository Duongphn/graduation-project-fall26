import { Link } from 'react-router-dom'
import { FOOTER_COLUMNS, FOOTER_TAGLINE } from '../../features/home/home-content'
import { SiteBrand } from './site-brand'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="home-container site-footer__grid">
        <div className="site-footer__about">
          <SiteBrand size="lg" />
          <p>{FOOTER_TAGLINE}</p>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="site-footer__column">
            <h2 className="site-footer__heading">{column.title}</h2>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="site-footer__link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="home-container site-footer__bottom">
        <p>© {year} ToyFlow</p>
      </div>
    </footer>
  )
}
