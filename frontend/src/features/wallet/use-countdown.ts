import { useEffect, useState } from 'react'

/** Số mili giây còn lại tới `deadline` (ISO), cập nhật mỗi giây; không âm */
export function useCountdown(deadline: string | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadline) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])

  if (!deadline) return undefined
  return Math.max(0, new Date(deadline).getTime() - now)
}

/** 754_000 → "12:34" */
export const formatCountdown = (ms: number) => {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
