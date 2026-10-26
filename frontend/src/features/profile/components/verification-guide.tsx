import { Camera, IdCard, Lock, ScanFace, Sun, type LucideIcon } from 'lucide-react'

const TIPS: { icon: LucideIcon; title: string; hint: string }[] = [
  { icon: IdCard, title: 'CCCD gốc, còn hạn', hint: 'Không dùng bản photo hay ảnh chụp màn hình' },
  { icon: Sun, title: 'Đủ sáng, không loá', hint: 'Đọc rõ chữ, số và mã QR' },
  { icon: Camera, title: 'Chụp thẳng, đủ 4 góc', hint: 'Thẻ chiếm phần lớn khung hình' },
  { icon: ScanFace, title: 'Chân dung rõ mặt', hint: 'Không đeo kính râm, khẩu trang, mũ' },
]

const EXAMPLES = [
  { key: 'sharp', label: 'Rõ nét', ok: true },
  { key: 'blurry', label: 'Bị mờ', ok: false },
  { key: 'cropped', label: 'Mất góc', ok: false },
] as const

/** Cột phải: hướng dẫn chụp ảnh và cam kết bảo mật */
export function VerificationGuide() {
  return (
    <aside className="verify-guide">
      <section className="tf-card tf-card--side" aria-labelledby="verify-guide-title">
        <h2 id="verify-guide-title" className="tf-section-title tf-section-title--sm">
          Hướng dẫn chụp ảnh
        </h2>
        <ul className="verify-tips">
          {TIPS.map(({ icon: Icon, title, hint }) => (
            <li key={title} className="verify-tips__item">
              <span className="verify-tips__icon">
                <Icon aria-hidden />
              </span>
              <span>
                <span className="verify-tips__title">{title}</span>
                <span className="verify-tips__hint">{hint}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Minh hoạ vẽ bằng CSS: thẻ đúng, thẻ mờ, thẻ lệch khung */}
        <ul className="verify-examples" aria-label="Ví dụ ảnh CCCD">
          {EXAMPLES.map((example) => (
            <li key={example.key} className={`verify-example ${example.ok ? 'is-ok' : 'is-bad'}`}>
              <span className={`verify-example__frame verify-example__frame--${example.key}`} aria-hidden>
                <span className="verify-example__card">
                  <span className="verify-example__band" />
                  <span className="verify-example__photo" />
                  <span className="verify-example__lines" />
                </span>
              </span>
              <span className="verify-example__label">
                {example.ok ? '✓' : '✕'} {example.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tf-card tf-card--side verify-privacy" aria-labelledby="verify-privacy-title">
        <h2 id="verify-privacy-title" className="verify-privacy__title">
          <Lock aria-hidden />
          Thông tin của bạn được bảo mật
        </h2>
        <p className="verify-privacy__text">
          Ảnh được lưu ở chế độ riêng tư, chỉ quản trị viên duyệt hồ sơ mới xem được. ToyFlow chỉ dùng để xác minh danh tính, không hiển thị cho người
          dùng khác.
        </p>
      </section>
    </aside>
  )
}
