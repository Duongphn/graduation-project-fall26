import { useId } from 'react'

export type RobotMood = 'sleeping' | 'awake' | 'happy'

interface RobotMascotProps {
  mood: RobotMood
  className?: string
}

/**
 * Robot trợ lý vẽ bằng SVG: ngủ (mắt nhắm, thở chậm), thức (mắt tròn, chớp mắt), vui (mắt cười, nhún nhảy).
 * Hiệu ứng nằm trong ai-chat.css và tự tắt khi người dùng bật "giảm chuyển động".
 */
export function RobotMascot({ mood, className = '' }: RobotMascotProps) {
  const gradientId = useId()

  return (
    <svg viewBox="0 0 64 64" className={`robot robot--${mood} ${className}`} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9e6ff" />
        </linearGradient>
      </defs>

      <g className="robot__body">
        {/* Ăng-ten */}
        <line x1="32" y1="13" x2="32" y2="6" stroke="#9db7f5" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="robot__antenna" cx="32" cy="5" r="3.5" />

        {/* Tai */}
        <rect x="5" y="25" width="6" height="12" rx="3" fill="#9db7f5" />
        <rect x="53" y="25" width="6" height="12" rx="3" fill="#9db7f5" />

        {/* Đầu + màn hình mặt */}
        <rect x="9" y="12" width="46" height="38" rx="16" fill={`url(#${gradientId})`} />
        <rect x="15" y="19" width="34" height="23" rx="10" fill="#1e3a8a" />

        {/* Má hồng (thức / vui) */}
        <circle className="robot__cheek" cx="19.5" cy="36" r="2.4" />
        <circle className="robot__cheek" cx="44.5" cy="36" r="2.4" />

        {mood === 'sleeping' && (
          <g stroke="#93c5fd" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <path d="M21 29.5q3.5 2.6 7 0" />
            <path d="M36 29.5q3.5 2.6 7 0" />
            <path d="M30 36h4" />
          </g>
        )}

        {mood === 'awake' && (
          <>
            <g className="robot__eyes" fill="#7dd3fc">
              <circle cx="24.5" cy="29" r="3.6" />
              <circle cx="39.5" cy="29" r="3.6" />
            </g>
            <g fill="#ffffff">
              <circle cx="25.8" cy="27.6" r="1.1" />
              <circle cx="40.8" cy="27.6" r="1.1" />
            </g>
            <path d="M28 35.5q4 3 8 0" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </>
        )}

        {mood === 'happy' && (
          <>
            <g stroke="#7dd3fc" strokeWidth="2.6" strokeLinecap="round" fill="none">
              <path d="M21 30.5q3.5-4 7 0" />
              <path d="M36 30.5q3.5-4 7 0" />
            </g>
            <path d="M26.5 34h11q-1 5.5-5.5 5.5T26.5 34z" fill="#7dd3fc" />
          </>
        )}
      </g>
    </svg>
  )
}
