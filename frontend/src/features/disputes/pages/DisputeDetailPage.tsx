import { Skeleton } from 'antd'
import { useParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert, StatusTag } from '../../../components/common'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { DisputeCaseCard, DisputeEvidence, DisputeHistory } from '../components/DisputeCasePanels'
import { DisputeDecisionPanel } from '../components/DisputeDecisionPanel'
import { useDispute } from '../hooks'

// One rental dispute (UC19): the case, the evidence of both sides, the history and the ruling.
export function DisputeDetailPage() {
  const { id = '' } = useParams()
  const query = useDispute(id)

  if (query.error) return <QueryErrorAlert error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data) return <Skeleton active paragraph={{ rows: 10 }} />

  const dispute = query.data
  return (
    <>
      <PageHeader
        title={`Khiếu nại ${dispute.code}`}
        description={`Đơn thuê ${dispute.order.code}${dispute.toy ? ` · ${dispute.toy.title}` : ''}`}
        breadcrumb={[
          adminHomeCrumb,
          { title: 'Giải quyết khiếu nại', to: adminPaths.disputes },
          { title: dispute.code },
        ]}
        actions={<StatusTag domain="dispute" status={dispute.status} />}
      />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DisputeCaseCard dispute={dispute} />
          </div>
          <DisputeHistory dispute={dispute} />
        </div>
        <DisputeEvidence dispute={dispute} />
        <DisputeDecisionPanel key={dispute.id} dispute={dispute} />
      </div>
    </>
  )
}
