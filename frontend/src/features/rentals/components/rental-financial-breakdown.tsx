import { formatVnd } from '../../toy-listings/format-vnd'
import type {
  OwnerFinancialItems,
  RentalFinancialBreakdown as Breakdown,
  RenterFinancialItems,
} from '../rental-orders-api'

const formatRate = (rate: number) => `${Math.round(rate * 1000) / 10}%`

interface MoneyRow {
  label: string
  amount: number
  sign?: '+' | '−'
  total?: boolean
}

function MoneyList({ rows, label }: { rows: MoneyRow[]; label?: string }) {
  return (
    <dl className="rental-money" aria-label={label}>
      {rows.map((row) => (
        <div key={row.label} className={row.total ? 'rental-money__total' : undefined}>
          <dt>{row.label}</dt>
          <dd>
            {row.sign && row.amount > 0 ? row.sign : ''}
            {formatVnd(row.amount)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Người thuê: chi phí thật (tiền thuê + phí trễ) tách khỏi tiền cọc, vì cọc được hoàn lại */
const renterCostRows = (items: RenterFinancialItems): MoneyRow[] => [
  { label: 'Tiền thuê', amount: items.rentalFee },
  { label: 'Phí trả trễ', amount: items.lateFee, sign: '+' },
  { label: 'Tổng chi thực tế', amount: items.totalActualCost, total: true },
]

const renterDepositRows = (items: RenterFinancialItems): MoneyRow[] => [
  { label: 'Cọc đã trả', amount: items.depositPaid },
  { label: 'Cọc hoàn lại', amount: items.depositRefunded },
]

const ownerRows = (items: OwnerFinancialItems): MoneyRow[] => [
  { label: 'Tiền thuê gộp', amount: items.grossRentalFee },
  { label: `Phí nền tảng ${formatRate(items.platformFeeRate)}`, amount: items.platformFee, sign: '−' },
  { label: 'Bồi thường trả trễ', amount: items.lateCompensation, sign: '+' },
  { label: 'Thực nhận', amount: items.netEarnings, total: true },
]

function RenterColumn({ items }: { items: RenterFinancialItems }) {
  return (
    <>
      <MoneyList rows={renterCostRows(items)} label="Chi phí người thuê" />
      <p className="rental-breakdown__group">Tiền cọc</p>
      <MoneyList rows={renterDepositRows(items)} label="Tiền cọc" />
    </>
  )
}

/**
 * Bảng chia tiền theo vai người xem (server đã tính): người thuê thấy chi phí và cọc, chủ đồ thấy
 * thực nhận sau phí nền tảng, quản trị viên thấy cả hai bên cùng phần của nền tảng và ký quỹ.
 * Đơn chưa kết thúc thì số liệu là tạm tính.
 */
export function RentalFinancialBreakdown({ breakdown }: { breakdown: Breakdown }) {
  return (
    <section className="rental-block rental-breakdown" aria-labelledby="breakdown-title">
      <div className="rental-breakdown__head">
        <h2 id="breakdown-title" className="rental-section-title">
          Chia tiền
        </h2>
        {breakdown.isEstimated && <span className="rental-breakdown__estimate">Tạm tính</span>}
      </div>

      {breakdown.role === 'renter' && <RenterColumn items={breakdown.items} />}

      {breakdown.role === 'owner' && <MoneyList rows={ownerRows(breakdown.items)} label="Thu nhập chủ đồ" />}

      {breakdown.role === 'admin' && (
        <>
          <div className="rental-breakdown__split">
            <div>
              <h3 className="rental-breakdown__col-title">Người thuê</h3>
              <RenterColumn items={breakdown.renter?.items ?? breakdown.items} />
            </div>
            <div>
              <h3 className="rental-breakdown__col-title">Chủ đồ</h3>
              <MoneyList rows={ownerRows(breakdown.owner?.items ?? breakdown.items)} label="Thu nhập chủ đồ" />
            </div>
          </div>
          <h3 className="rental-breakdown__col-title">Nền tảng</h3>
          <MoneyList
            label="Nền tảng"
            rows={[
              { label: 'Doanh thu nền tảng', amount: breakdown.platformRevenue ?? breakdown.items.platformRevenue ?? 0 },
              { label: 'Số dư ký quỹ', amount: breakdown.items.escrowBalance ?? 0 },
            ]}
          />
        </>
      )}

      <p className="rental-block__note">{breakdown.summary.description}</p>
    </section>
  )
}
