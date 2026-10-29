interface OrganizationLogoProps {
  name: string
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

/** Biểu tượng tổ chức: chữ cái đầu trên nền navy nhạt (tổ chức không có logo) */
export function OrganizationLogo({ name, size = 'md' }: OrganizationLogoProps) {
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} grid shrink-0 place-items-center bg-tf-primary-fixed font-bold text-tf-primary`}
    >
      {initialsOf(name)}
    </span>
  )
}
