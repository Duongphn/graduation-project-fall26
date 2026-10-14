import { Bot, Camera, CircleCheck, CreditCard, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandLogo } from '../../../components/brand-logo'

/** Cột trái trang đăng nhập: thông điệp thương hiệu + minh hoạ các điểm tin cậy (ẩn trên mobile) */
export function LoginBrandPanel() {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-navy bg-dot-pattern p-14 text-white lg:flex lg:w-1/2">
   
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[28rem] rounded-full bg-blue-500/20 blur-3xl"
      />

      <BrandLogo />

      <div className="relative my-auto py-10">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-amber-400" />
          Chào mừng bạn quay lại
        </p>
        <h1 className="mb-4 text-[40px] leading-tight font-extrabold tracking-tight xl:text-5xl">
          Mỗi tuần một món mới,
          <br />
          <span className="text-amber-500">không cần mua mới</span>
        </h1>
        <p className="mb-12 max-w-md leading-relaxed text-slate-300">
          Đăng nhập để thuê đồ, theo dõi đơn hàng, ví và tiền cọc của bạn.
        </p>

        <ToyShowcase />
      </div>

      <ul className="relative flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-xs font-medium text-slate-300">
        <TrustItem icon={<CircleCheck className="size-4 text-emerald-400" />}>Người dùng xác minh CCCD</TrustItem>
        <TrustItem icon={<CreditCard className="size-4 text-amber-400" />}>Giữ cọc trong ví</TrustItem>
        <TrustItem icon={<Camera className="size-4 text-sky-400" />}>Ảnh bàn giao</TrustItem>
      </ul>
    </section>
  )
}

function TrustItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {icon}
      {children}
    </li>
  )
}

/** Minh hoạ tĩnh mang tính trang trí (aria-hidden) — không phải dữ liệu sản phẩm */
function ToyShowcase() {
  return (
    <div aria-hidden className="relative h-80 w-full max-w-md select-none">
      <FloatingBadge
        className="-top-3 right-4"
        icon={<Bot className="size-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        title="AI kiểm tra ảnh"
        subtitle="Không phát hiện hư hỏng"
      />

      <ToyCard
        className="top-4 left-2 z-10 -rotate-3"
        mediaClass="bg-[#eafaf2] text-emerald-600"
        frameClass="border-emerald-500/80"
        label="Lego"
        name="Bộ Lego Classic 500 chi tiết"
        price={
          <>
            <span className="text-blue-700">25.000 đ</span>
            <span className="ml-1 text-[10px] font-normal text-slate-400">/ngày</span>
          </>
        }
        rating="4.9"
      />
      <ToyCard
        className="top-12 right-0 z-20 rotate-3"
        mediaClass="bg-[#fff4eb] text-amber-700"
        frameClass="border-amber-600/70"
        label="Nam châm"
        name="Xếp hình nam châm 64 miếng"
        price={<span className="text-amber-600">220.000 đ</span>}
      />

      <FloatingBadge
        className="-bottom-2 left-0"
        icon={<ShieldCheck className="size-4" />}
        iconClass="bg-blue-50 text-blue-600"
        title="Cọc 400.000 đ"
        subtitle="ToyFlow giữ đến khi trả đồ"
      />
    </div>
  )
}

interface ToyCardProps {
  className: string
  mediaClass: string
  frameClass: string
  label: string
  name: string
  price: ReactNode
  rating?: string
}

function ToyCard({ className, mediaClass, frameClass, label, name, price, rating }: ToyCardProps) {
  return (
    <div
      className={`absolute w-56 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none ${className}`}
    >
      <div className={`flex h-32 items-center justify-center ${mediaClass}`}>
        <div className={`flex h-12 min-w-16 items-center justify-center rounded-lg border-2 px-2 ${frameClass}`}>
          <span className="text-[11px] font-bold">{label}</span>
        </div>
      </div>
      <div className="p-3.5">
        <p className="truncate text-xs font-bold text-slate-800">{name}</p>
        <div className="mt-1.5 flex items-center justify-between text-xs font-extrabold">
          <p>{price}</p>
          {rating && (
            <span className="flex items-center gap-0.5 text-[11px] font-bold text-slate-600">
              <span className="text-amber-400">★</span> {rating}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface FloatingBadgeProps {
  className: string
  icon: ReactNode
  iconClass: string
  title: string
  subtitle: string
}

function FloatingBadge({ className, icon, iconClass, title, subtitle }: FloatingBadgeProps) {
  return (
    <div
      className={`absolute z-30 flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 text-slate-800 shadow-xl ${className}`}
    >
      <div className={`flex size-7 items-center justify-center rounded-lg ${iconClass}`}>{icon}</div>
      <div>
        <p className="text-xs leading-tight font-bold text-slate-900">{title}</p>
        <p className="text-[10px] leading-tight text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}
