import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EyeOff, ImageOff, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS, toyListingEditPath } from '../../../routes/paths'
import { formatVnd } from '../format-vnd'
import { displayCode, formatDate, STATUS_LABELS } from '../listing-display'
import { deleteToyListing, getListingErrorMessage, hideToyListing, type ToyListing } from '../toy-listing-api'
import { MY_LISTINGS_ROOT_KEY, myListingQuery } from '../toy-listing-queries'
import type { DonationToyState } from '../../donations/donor-queries'

interface MyListingRowProps {
  listing: ToyListing
  categoryName?: string
  // Tin tặng đang được trao (đã đồng ý / đang gửi) hoặc đã tặng xong
  donationState?: DonationToyState
}

const DONATION_STATE_LABELS: Record<DonationToyState, string> = {
  giving: 'Đang trao tặng',
  donated: 'Đã tặng',
}

export function MyListingRow({ listing, categoryName, donationState }: MyListingRowProps) {
  const queryClient = useQueryClient()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const isRent = listing.listingType === 'rent'
  const isDonation = listing.listingType === 'donate'
  // Đồ đang trao hoặc đã tặng: không cho ẩn/xoá (phiếu quyên góp còn tham chiếu tới đồ chơi)
  const lockedByDonation = donationState !== undefined

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_ROOT_KEY })
    queryClient.removeQueries({ queryKey: myListingQuery(listing.id).queryKey })
  }

  const hideMutation = useMutation({ mutationFn: () => hideToyListing(listing.id), onSuccess: refreshLists })
  const deleteMutation = useMutation({ mutationFn: () => deleteToyListing(listing.id), onSuccess: refreshLists })
  const isBusy = hideMutation.isPending || deleteMutation.isPending
  const actionError = hideMutation.error ?? deleteMutation.error

  return (
    <article className={`listing-row ${isBusy ? 'is-busy' : ''}`}>
      <div className="listing-row__media">
        {listing.images[0] ? (
          <img src={listing.images[0].url} alt="" className="listing-row__image" loading="lazy" />
        ) : (
          <span className="listing-row__placeholder">
            <ImageOff aria-hidden />
          </span>
        )}
        <span className={`listing-row__type listing-row__type--${listing.listingType}`}>{isRent ? 'Cho thuê' : isDonation ? 'Tặng' : 'Bán lại'}</span>
      </div>

      <div className="listing-row__body">
        <div className="listing-row__meta">
          {donationState ? (
            <span className="status-badge status-badge--sold">{DONATION_STATE_LABELS[donationState]}</span>
          ) : (
            <span className={`status-badge status-badge--${listing.status}`}>{STATUS_LABELS[listing.status]}</span>
          )}
          <span>
            Mã {displayCode(listing.id)} · Đăng ngày {formatDate(listing.createdAt)}
            {categoryName && ` · ${categoryName}`}
          </span>
        </div>

        <h3 className="listing-row__title">
          {/* Tin tặng không sửa bằng form đăng tin (không có giá) */}
          {isDonation ? (
            listing.title
          ) : (
            <Link to={toyListingEditPath(listing.id)} className="listing-row__title-link">
              {listing.title}
            </Link>
          )}
        </h3>

        <div className="listing-row__price-row">
          <span className={`listing-row__price listing-row__price--${listing.listingType}`}>
            {isDonation ? 'Miễn phí' : formatVnd(listing.priceOrRate)}
            {isRent && <span className="listing-row__unit">/ngày</span>}
          </span>
          {isRent && listing.depositPrice !== undefined && (
            <span className="listing-row__chip">Cọc {formatVnd(listing.depositPrice)}</span>
          )}
          <span className="listing-row__chip">{listing.condition}</span>
        </div>

        {actionError && (
          <p className="listing-row__error" role="alert">
            {getListingErrorMessage(actionError)}
          </p>
        )}
      </div>

      <div className="listing-row__actions">
        {confirmingDelete ? (
          <>
            <span className="listing-row__confirm-text">Xoá vĩnh viễn tin này?</span>
            <button type="button" className="row-btn row-btn--danger-solid" onClick={() => deleteMutation.mutate()} disabled={isBusy}>
              {deleteMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
              Xoá
            </button>
            <button type="button" className="row-btn" onClick={() => setConfirmingDelete(false)} disabled={isBusy}>
              Giữ lại
            </button>
          </>
        ) : (
          <>
            {!isDonation && (
              <Link to={toyListingEditPath(listing.id)} className="row-btn row-btn--primary">
                <Pencil aria-hidden />
                Sửa
              </Link>
            )}
            {!lockedByDonation && listing.status !== 'hidden' && listing.status !== 'sold' && (
              <button type="button" className="row-btn" onClick={() => hideMutation.mutate()} disabled={isBusy}>
                {hideMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <EyeOff aria-hidden />}
                Ẩn tin
              </button>
            )}
            {lockedByDonation ? (
              <Link to={PATHS.myDonations} className="row-btn">
                Xem phiếu quyên góp
              </Link>
            ) : (
              <button type="button" className="row-btn row-btn--danger" onClick={() => setConfirmingDelete(true)} disabled={isBusy}>
                <Trash2 aria-hidden />
                Xoá
              </button>
            )}
          </>
        )}
      </div>
    </article>
  )
}
