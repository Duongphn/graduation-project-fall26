import { Skeleton, Typography } from 'antd'
import { useParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert, StatusTag } from '../../../components/common'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDateTime } from '../../../utils/format'
import { DonationActions } from '../components/DonationActions'
import { DonationParties } from '../components/DonationParties'
import { DonationTimeline } from '../components/DonationTimeline'
import { useDonationRequest } from '../hooks'

// One donation request: parties, toy, handovers, history and the Admin actions.
export function AdminDonationRequestDetailPage() {
  const { id = '' } = useParams()
  const query = useDonationRequest(id)

  if (query.error) return <QueryErrorAlert error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton active />

  const request = query.data
  return (
    <>
      <PageHeader
        title={`Yêu cầu ${request.code}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusTag domain="donation" status={request.status} />
            <Typography.Text type="secondary">
              Gửi lúc {formatDateTime(request.createdAt)}
            </Typography.Text>
          </span>
        }
        breadcrumb={[
          adminHomeCrumb,
          { title: 'Yêu cầu nhận tặng', to: adminPaths.donationRequests },
          { title: request.code },
        ]}
        actions={<DonationActions request={request} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DonationParties request={request} />
        <DonationTimeline request={request} />
      </div>
    </>
  )
}
