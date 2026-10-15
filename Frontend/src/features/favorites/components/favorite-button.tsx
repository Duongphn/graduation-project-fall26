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
      className={`favorite-button ${isFavorite ? 'is-active' : ''} ${className}`}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Bỏ "${toyTitle}" khỏi yêu thích` : `Thêm "${toyTitle}" vào yêu thích`}
      onClick={handleClick}
    >
      <Heart aria-hidden />
    </button>
  )
}
