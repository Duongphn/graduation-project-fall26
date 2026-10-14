import {
  CameraOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import type { ComponentType, ReactNode } from 'react'
import { BrandLogo } from '../../../components/ui/brand-logo'

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export interface AuthBrandPanelProps {
  eyebrow: string
  lead: string
}

export function AuthBrandPanel({ eyebrow, lead }: AuthBrandPanelProps) {
  return (
    <section className="auth-brand">
      <div className="auth-brand__glow" aria-hidden />

      <BrandLogo />

      <div className="auth-brand__hero">
        <p className="auth-brand__eyebrow">
          <span className="auth-brand__eyebrow-dot" />
          {eyebrow}
        </p>
        <h1 className="auth-brand__title">
          Mỗi tuần một món mới,
          <br />
          <span className="auth-brand__title-highlight">không cần mua mới</span>
        </h1>
        <p className="auth-brand__lead">{lead}</p>

        <ToyShowcase />
      </div>

      <ul className="auth-brand__trust-list">
        <TrustItem icon={CheckCircleOutlined} variant="verified">
          Người dùng xác minh CCCD
        </TrustItem>
        <TrustItem icon={CreditCardOutlined} variant="deposit">
          Giữ cọc trong ví
        </TrustItem>
        <TrustItem icon={CameraOutlined} variant="handover">
          Ảnh bàn giao
        </TrustItem>
      </ul>
    </section>
  )
}

interface TrustItemProps {
  icon: IconComponent
  variant: 'verified' | 'deposit' | 'handover'
  children: ReactNode
}

function TrustItem({ icon: Icon, variant, children }: TrustItemProps) {
  return (
    <li className="auth-brand__trust-item">
      <Icon className={`auth-brand__trust-icon auth-brand__trust-icon--${variant}`} aria-hidden />
      {children}
    </li>
  )
}

/** Minh hoạ tĩnh mang tính trang trí (aria-hidden) — không phải dữ liệu sản phẩm */
function ToyShowcase() {
  return (
    <div className="toy-showcase" aria-hidden>
      <ShowcaseBadge variant="ai-check" icon={RobotOutlined} title="AI kiểm tra ảnh" subtitle="Không phát hiện hư hỏng" />

      <ShowcaseCard
        variant="rental"
        label="Lego"
        name="Bộ Lego Classic 500 chi tiết"
        price="25.000 đ"
        priceUnit="/ngày"
        rating="4.9"
      />
      <ShowcaseCard variant="resale" label="Nam châm" name="Xếp hình nam châm 64 miếng" price="220.000 đ" />

      <ShowcaseBadge variant="deposit" icon={SafetyCertificateOutlined} title="Cọc 400.000 đ" subtitle="ToyFlow giữ đến khi trả đồ" />
    </div>
  )
}

interface ShowcaseCardProps {
  variant: 'rental' | 'resale'
  label: string
  name: string
  price: string
  priceUnit?: string
  rating?: string
}

function ShowcaseCard({ variant, label, name, price, priceUnit, rating }: ShowcaseCardProps) {
  return (
    <div className={`showcase-card showcase-card--${variant}`}>
      <div className="showcase-card__media">
        <span className="showcase-card__frame">{label}</span>
      </div>
      <div className="showcase-card__body">
        <p className="showcase-card__name">{name}</p>
        <div className="showcase-card__meta">
          <p className="showcase-card__price">
            {price}
            {priceUnit && <span className="showcase-card__price-unit">{priceUnit}</span>}
          </p>
          {rating && (
            <span className="showcase-card__rating">
              <span className="showcase-card__rating-star">★</span> {rating}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface ShowcaseBadgeProps {
  variant: 'ai-check' | 'deposit'
  icon: IconComponent
  title: string
  subtitle: string
}

function ShowcaseBadge({ variant, icon: Icon, title, subtitle }: ShowcaseBadgeProps) {
  return (
    <div className={`showcase-badge showcase-badge--${variant}`}>
      <div className="showcase-badge__icon">
        <Icon />
      </div>
      <div>
        <p className="showcase-badge__title">{title}</p>
        <p className="showcase-badge__subtitle">{subtitle}</p>
      </div>
    </div>
  )
}
