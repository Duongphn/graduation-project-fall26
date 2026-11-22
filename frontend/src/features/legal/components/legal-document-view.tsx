import { ChevronRight, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SiteLayout } from '../../../layouts/site/site-layout'
import { PATHS } from '../../../routes/paths'
import type { LegalDocument } from '../legal-content'

interface LegalDocumentViewProps {
  document: LegalDocument
  /** Link sang văn bản còn lại (Điều khoản ↔ Chính sách) ở cuối trang */
  related: { label: string; to: string }
}

/** Trang văn bản pháp lý công khai: tiêu đề, mục lục (neo #id) và các mục nội dung */
export function LegalDocumentView({ document: legal, related }: LegalDocumentViewProps) {
  useEffect(() => {
    document.title = `${legal.title} | ToyFlow`
  }, [legal.title])

  return (
    <SiteLayout>
      <div className="home-container legal-page">
        <nav aria-label="Breadcrumb" className="legal-page__breadcrumb">
          <Link to={PATHS.home} className="legal-page__crumb">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page" className="legal-page__crumb--current">
            {legal.title}
          </span>
        </nav>

        <header className="legal-page__header">
          <h1 className="legal-page__title">{legal.title}</h1>
          <p className="legal-page__updated">Cập nhật lần cuối: {legal.updatedAt}</p>
          <p className="legal-page__intro">{legal.intro}</p>
        </header>

        <div className="legal-page__layout">
          <nav aria-label="Mục lục" className="legal-page__toc">
            <p className="legal-page__toc-title">Mục lục</p>
            <ol>
              {legal.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="legal-page__toc-link">
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="legal-page__body">
            {legal.sections.map((section) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="legal-section">
                <h2 id={`${section.id}-title`} className="legal-section__title">
                  {section.heading}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="legal-section__text">
                    {paragraph}
                  </p>
                ))}
                {section.items && (
                  <ul className="legal-section__list">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <p className="legal-page__related">
              Xem thêm: <Link to={related.to}>{related.label}</Link>
            </p>
          </article>
        </div>
      </div>
    </SiteLayout>
  )
}
