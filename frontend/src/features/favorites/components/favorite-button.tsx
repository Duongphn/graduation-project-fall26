import { Heart } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { PATHS } from '../../../routes/paths'
import { readFavoriteIds, subscribeFavorites, toggleFavoriteId } from '../favorites-storage'

interface FavoriteButtonProps {
  toyId: string
  toyTitle: string
  className?: string
}

/**
 * Nút ♡ trên thẻ đồ chơi. Khách → sang trang đăng nhập (đăng nhập xong quay lại trang đang xem);
 * đã đăng nhập → bật/tắt yêu thích.
 */
export function FavoriteButton({ toyId, toyTitle, className = '' }: FavoriteButtonProps) {
  const isSignedIn = useIsSignedIn()
  const favoriteIds = useSyncExternalStore(subscribeFavorites, readFavoriteIds)
  const navigate = useNavigate()
  const location = useLocation()
  const isFavorite = isSignedIn && favoriteIds.includes(toyId)

  const handleClick = () => {
    if (!isSignedIn) {
      navigate(PATHS.login, { state: { from: location.pathname + location.search } })
      return
    }
    toggleFavoriteId(toyId)
  }

  return (
    <button
      type="button"
      className={`grid size-8 cursor-pointer place-items-center rounded-full bg-white/95 shadow-sm transition-[color,transform,background-color] duration-200 ease-out-quint hover:scale-110 hover:text-tf-error focus-ring active:scale-95 dark:bg-night-900/90 ${
        isFavorite
          ? 'text-tf-error dark:text-rose-400 dark:hover:text-rose-400'
          : 'text-tf-ink-muted dark:text-slate-300'
      } ${className}`}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Bỏ "${toyTitle}" khỏi yêu thích` : `Thêm "${toyTitle}" vào yêu thích`}
      onClick={handleClick}
    >
      <Heart
        className={`size-4 transition-[fill,transform] duration-200 ${isFavorite ? 'scale-110 fill-current' : ''}`}
        aria-hidden
      />
    </button>
  )
}
