interface OrganizationLogoProps {
  name: string
  logoUrl: string | null
  size?: 'md' | 'lg'
}

const SIZES = {
  md: 'size-14 rounded-lg text-lg',
  lg: 'size-28 rounded-xl text-3xl sm:size-32',
}

/** Chữ cái đầu của 2 từ cuối, vd. "Mái ấm Hoa Hồng" → "HH" */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')

/** Logo tổ chức (ảnh Admin tải lên); chưa có logo thì hiện chữ cái đầu trên nền navy nhạt */
export function OrganizationLogo({ name, logoUrl, size = 'md' }: OrganizationLogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${SIZES[size]} shrink-0 border border-tf-surface bg-white object-cover`}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} grid shrink-0 place-items-center bg-tf-primary-fixed font-bold text-tf-primary`}
    >
      {initialsOf(name)}
    </span>
  )
}
