import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { RENTAL_GUARANTEE, RENTAL_STEPS } from '../home-content'
import { HOME_LINK } from '../home-styles'

export function HowItWorksSection() {
  const { icon: GuaranteeIcon } = RENTAL_GUARANTEE

  return (
    // Dải nền trắng tràn hết chiều ngang: xen kẽ với nền xám nhạt của trang để tạo nhịp
    <section className="mt-6 bg-white py-8 sm:mt-8 sm:py-10 dark:bg-night-900" aria-labelledby="home-steps-title">
      <div className="home-container">
        <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="home-steps-title"
              className="text-2xl font-bold tracking-[-0.02em] text-site-ink sm:text-[28px] dark:text-white"
            >
              Thuê đồ chơi trên ToyFlow như thế nào?
            </h2>
            <p className="mt-1 text-sm text-site-muted dark:text-slate-400">
              {RENTAL_STEPS.length} bước, tiền cọc luôn được giữ an toàn đến khi trả đồ.
            </p>
          </div>
          <Link to={`${PATHS.help}#rental`} className={HOME_LINK}>
            Quy định thuê và đặt cọc <ArrowRight aria-hidden />
          </Link>
        </header>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RENTAL_STEPS.map((step, index) => (
            <li
              key={step.title}
              // after: đường nét đứt nối sang bước kế tiếp (desktop), ngang tầm ô ảnh
              className="group relative flex flex-col gap-2.5 rounded-2xl border border-transparent bg-site-page p-4 transition-[border-color,box-shadow,transform] duration-300 ease-out-quint not-last:after:absolute not-last:after:top-[5.5rem] not-last:after:-right-4 not-last:after:hidden not-last:after:h-0 not-last:after:w-4 not-last:after:border-t-2 not-last:after:border-dashed not-last:after:border-tf-outline not-last:after:content-[''] sm:p-5 lg:not-last:after:block dark:bg-night-800 dark:not-last:after:border-night-700"
            >
              <div className="relative mb-1 grid h-36 place-items-center rounded-xl bg-gradient-to-b from-white to-tf-surface-low/80 dark:from-night-800 dark:to-night-900">
                <img
                  src={step.image}
                  alt=""
                  className="size-28 object-contain drop-shadow-[0_10px_14px_rgb(18_23_31/0.14)] transition-transform duration-300 ease-out-quint group-hover:-translate-y-1 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
                {/* <ol> đã cho trình đọc màn hình biết thứ tự → nhãn này chỉ để nhìn */}
                <span
                  className="absolute top-2.5 left-2.5 rounded-full bg-tf-primary px-2.5 py-1 text-xs font-bold text-white shadow-sm dark:bg-indigo-300 dark:text-night-950"
                  aria-hidden
                >
                  Bước {index + 1}
                </span>
              </div>
              <h3 className="text-base font-semibold text-site-ink dark:text-white">{step.title}</h3>
              <p className="text-sm leading-6 text-site-muted dark:text-slate-400">{step.description}</p>
            </li>
          ))}
        </ol>

        <p className="mt-5 flex items-start gap-2.5 text-sm leading-6 text-site-muted dark:text-slate-400">
          <GuaranteeIcon className="mt-0.5 size-4 shrink-0 text-tf-primary dark:text-violet-300" aria-hidden />{' '}
          {RENTAL_GUARANTEE.text}
        </p>
      </div>
    </section>
  )
}
