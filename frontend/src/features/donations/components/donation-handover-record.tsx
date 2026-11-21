import { CalendarClock, PackageCheck, Truck } from 'lucide-react'

import { formatDate, formatDateTime } from '../../../utils/format'
import { donationHandoverMethodLabels, receiptChannelLabels } from '../constants'
import type { DonationRequestDetail } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

const sentAtOf = (request: DonationRequestDetail) =>
  request.handovers.find((handover) => handover.step === 'DONOR_SENT')?.at ?? null

/**
 * Dòng hạn của bước hiện tại (R03 III.5.2.2 (3)): Chờ → hạn quyết định, Đã chấp nhận → hạn bàn
 * giao, Đang bàn giao → ngày gửi và số ngày đã chờ.
 */
export function DonationDeadline({ request, now = new Date() }: { request: DonationRequestDetail; now?: Date }) {
  const sentAt = sentAtOf(request)
  let text: string | null = null
  if (request.status === 'pending' && request.dueAt) text = `Hạn quyết định: ${formatDateTime(request.dueAt)}`
  if (request.status === 'accepted' && request.dueAt) text = `Hạn bàn giao: ${formatDateTime(request.dueAt)}`
  if (request.status === 'shipping' && sentAt) {
    const days = Math.max(0, Math.floor((now.getTime() - new Date(sentAt).getTime()) / DAY_MS))
    text = `Đã gửi ${formatDateTime(sentAt)} · đã chờ ${days} ngày`
  }
  if (!text) return null
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-tf-ink">
      <CalendarClock className="size-4 shrink-0 text-tf-primary" aria-hidden /> {text}
    </p>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-wrap gap-x-2">
    <dt className="text-tf-ink-muted">{label}:</dt>
    <dd className="font-medium text-tf-ink">{value}</dd>
  </div>
)

/**
 * Bản ghi bàn giao từ Đang bàn giao (R03 III.5.2.2 (11): cách bàn giao, đơn vị vận chuyển, mã vận
 * đơn, ngày gửi) và phần xác nhận đã nhận khi Hoàn tất ((12): ngày nhận, ai xác nhận, qua kênh nào).
 * Ảnh bàn giao và ảnh nhận hàng nằm ở thẻ "Bàn giao" của lịch sử.
 */
export function DonationHandoverRecord({ request }: { request: DonationRequestDetail }) {
  const sentAt = sentAtOf(request)
  const completed = request.status === 'completed'
  if (!sentAt && !completed) return null
  const receipt = request.receipt
  // Bên nhận là người dùng tự xác nhận trên ToyFlow (GB-59)
  const confirmedBy = receipt?.confirmedBy ?? (request.organization ? null : request.requester?.fullName)

  return (
    <section aria-label="Bàn giao và nhận" className="flex flex-col gap-4 rounded-xl border border-tf-surface bg-white p-5">
      {sentAt && (
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-tf-ink">
            <Truck className="size-4 text-tf-primary" aria-hidden /> Bản ghi bàn giao
          </h2>
          <dl className="flex flex-col gap-1 text-sm">
            {request.handoverMethod && (
              <Row label="Cách bàn giao" value={donationHandoverMethodLabels[request.handoverMethod]} />
            )}
            {request.carrierName && <Row label="Đơn vị vận chuyển" value={request.carrierName} />}
            {request.trackingCode && <Row label="Mã vận đơn" value={request.trackingCode} />}
            <Row label="Ngày gửi" value={formatDateTime(sentAt)} />
          </dl>
        </div>
      )}
      {completed && (
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-tf-ink">
            <PackageCheck className="size-4 text-tf-secondary" aria-hidden /> Xác nhận đã nhận
          </h2>
          <dl className="flex flex-col gap-1 text-sm">
            <Row label="Ngày nhận" value={formatDate(receipt?.receivedAt ?? request.completedAt)} />
            {confirmedBy && <Row label="Người xác nhận" value={confirmedBy} />}
            {receipt?.channel ? (
              <Row label="Kênh xác nhận" value={receiptChannelLabels[receipt.channel]} />
            ) : (
              !request.organization && <Row label="Kênh xác nhận" value="Trên ToyFlow" />
            )}
          </dl>
        </div>
      )}
    </section>
  )
}
