import { Link } from 'react-router-dom'
import brandMark from '../../assets/brand/toyflow-mark.png'
import brandWordmark from '../../assets/brand/toyflow-wordmark.png'
import { PATHS } from '../../routes/paths'

interface SiteBrandProps {
  size?: 'md' | 'lg'
}

/** Logo ToyFlow: gấu trong hộp + chữ ToyFlow (ảnh nền trong suốt, tách từ logo gốc) */
export function SiteBrand({ size = 'md' }: SiteBrandProps) {
  return (
    <Link to={PATHS.home} className={`site-brand site-brand--${size}`} aria-label="ToyFlow - Trang chủ">
      <img src={brandMark} alt="" className="site-brand__mark" width={226} height={160} />
      <img src={brandWordmark} alt="" className="site-brand__wordmark" width={366} height={96} />
    </Link>
  )
}
