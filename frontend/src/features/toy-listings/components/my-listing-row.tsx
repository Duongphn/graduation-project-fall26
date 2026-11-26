import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Eye, EyeOff, ImageOff, Loader2, MessageSquareWarning, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS, toyListingEditPath } from '../../../routes/paths'
import { formatVnd } from '../format-vnd'
import { displayCode, formatDate, isRejected, REJECTED_LABEL, STATUS_LABELS } from '../listing-display'
import { deleteToyListing, getListingErrorMessage, hideToyListing, showToyListing, type ToyListing } from '../toy-listing-api'
import { MY_LISTINGS_ROOT_KEY, myListingQuery } from '../toy-listing-queries'
import type { DonationToyState } from '../../donations/donor-queries'
import { SendToOrganizationModal } from '../../donations/components/send-to-organization-modal'

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
  const [showingReason, setShowingReason] = useState(false)
  // Bị Admin từ chối: hiện nhãn riêng và lý do, sửa tin là gửi duyệt lại (R03 III.3.2.1, BF-02 1a)
  const rejected = isRejected(listing)
  const reasonId = `listing-reason-${listing.id}`
  const isRent = listing.listingType === 'rent'
  const isDonation = listing.listingType === 'donate'
  // Đồ đang trao hoặc đã tặng: không cho ẩn/xoá (phiếu quyên góp còn tham chiếu tới đồ chơi)
  const lockedByDonation = donationState !== undefined
  // Tin tặng chỉ sửa khi bị từ chối hoặc bị ẩn (UC33 5.1, GB-60): sửa xong là gửi duyệt lại
  const canEdit = !isDonation || (!lockedByDonation && listing.status === 'hidden')

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_ROOT_KEY })
    queryClient.removeQueries({ queryKey: myListingQuery(listing.id).queryKey })
  }

  const hideMutation = useMutation({ mutationFn: () => hideToyListing(listing.id), onSuccess: refreshLists })
  const showMutation = useMutation({ mutationFn: () => showToyListing(listing.id), onSuccess: refreshLists })
  const deleteMutation = useMutation({ mutationFn: () => deleteToyListing(listing.id), onSuccess: refreshLists })
  const isBusy = hideMutation.isPending || showMutation.isPending || deleteMutation.isPending
  const actionError = hideMutation.error ?? showMutation.error ?? deleteMutation.error
  // R03 III.3.2.1: chỉ tin đang hiển thị mới ẩn được (tin chờ duyệt chỉ có Sửa và Xoá); tin chủ đồ
  // đã ẩn (không bị từ chối) có "Hiện lại" (GB-08)
  const canHide = !lockedByDonation && listing.status === 'active'
  const canShowAgain = !lockedByDonation && listing.status === 'hidden' && !rejected
  // UC33 (GB-56): tin tặng đang hiển thị, chưa có ai được đồng ý tặng, gửi được tới một tổ chức
  const canSendToOrganization = isDonation && !lockedByDonation && listing.status === 'active'
  const [sendingToOrganization, setSendingToOrganization] = useState(false)

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
          ) : rejected ? (
            <span className="status-badge status-badge--rejected">{REJECTED_LABEL}</span>
          ) : (
            <span className={`status-badge status-badge--${listing.status}`}>{STATUS_LABELS[listing.status]}</span>
          )}
          <span>
            Mã {displayCode(listing.id)} · Đăng ngày {formatDate(listing.createdAt)}
            {categoryName && ` · ${categoryName}`}
          </span>
        </div>

        <h3 className="listing-row__title">
          {!canEdit ? (
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

        {rejected && showingReason && (
          <p id={reasonId} className="listing-row__reason">
            <strong>Lý do từ chối:</strong> {listing.moderation?.rejectReason}
            {' Sửa tin rồi lưu để gửi duyệt lại.'}
          </p>
        )}

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
            {rejected && (
              <button
                type="button"
                className="row-btn"
                aria-expanded={showingReason}
                aria-controls={reasonId}
                onClick={() => setShowingReason((shown) => !shown)}
              >
                <MessageSquareWarning aria-hidden />
                {showingReason ? 'Ẩn lý do' : 'Xem lý do'}
              </button>
            )}
            {canEdit && (
              <Link to={toyListingEditPath(listing.id)} className="row-btn row-btn--primary">
                <Pencil aria-hidden />
                Sửa
              </Link>
            )}
            {canSendToOrganization && (
              <button
                type="button"
                className="row-btn row-btn--primary"
                onClick={() => setSendingToOrganization(true)}
                disabled={isBusy}
              >
                <Building2 aria-hidden />
                Gửi tới tổ chức
              </button>
            )}
            {canHide && (
              <button type="button" className="row-btn" onClick={() => hideMutation.mutate()} disabled={isBusy}>
                {hideMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <EyeOff aria-hidden />}
                Ẩn tin
              </button>
            )}
            {canShowAgain && (
              <button type="button" className="row-btn" onClick={() => showMutation.mutate()} disabled={isBusy}>
                {showMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Eye aria-hidden />}
                Hiện lại
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

      {canSendToOrganization && (
        <SendToOrganizationModal
          open={sendingToOrganization}
          onClose={() => setSendingToOrganization(false)}
          toy={listing}
        />
      )}
    </article>
  )
}
