import { Skeleton } from 'antd'
import { useParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert, StatusTag } from '../../../components/common'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { IdentityDocumentsPanel } from '../components/IdentityDocumentsPanel'
import { IdentityReviewPanel } from '../components/IdentityReviewPanel'
import { IdentityUserCard } from '../components/IdentityUserCard'
import { PreviousAttemptsTimeline } from '../components/PreviousAttemptsTimeline'
import { useIdentityVerification } from '../hooks'

// One identity verification: documents, account data, earlier attempts and the decision.
export function IdentityVerificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const detail = useIdentityVerification(id)
  const verification = detail.data

  return (
    <>
      <PageHeader
        title="Yêu cầu xác minh danh tính"
        description={verification?.user ? `Người dùng: ${verification.user.fullName}` : undefined}
        breadcrumb={[
          adminHomeCrumb,
          { title: 'Xác minh danh tính', to: adminPaths.identityVerifications },
          { title: 'Chi tiết yêu cầu' },
        ]}
        actions={verification && <StatusTag domain="identity" status={verification.status} />}
      />
      {detail.error ? (
        <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !verification ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <div className="flex flex-col gap-4">
          <IdentityDocumentsPanel
            verification={verification}
            refreshing={detail.isFetching}
            onRefresh={() => void detail.refetch()}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <IdentityUserCard verification={verification} />
            <PreviousAttemptsTimeline verification={verification} />
            <IdentityReviewPanel key={verification.id} verification={verification} />
          </div>
        </div>
      )}
    </>
  )
}
