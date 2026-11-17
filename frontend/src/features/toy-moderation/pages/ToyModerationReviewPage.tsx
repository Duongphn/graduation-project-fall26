import { Card, Col, Row, Skeleton } from 'antd'
import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import { ImageGallery, PageHeader, QueryErrorAlert } from '../../../components/common'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { ModerationActions } from '../components/ModerationActions'
import { ModerationStatusCard } from '../components/ModerationStatusCard'
import { ModerationWarnings } from '../components/ModerationWarnings'
import { OwnerCard } from '../components/OwnerCard'
import { SafetyChecklistCard } from '../components/SafetyChecklistCard'
import { ToyDetailsCard } from '../components/ToyDetailsCard'
import type { SafetyChecklistKey } from '../constants'
import { queuePathFrom } from '../format'
import { useToyModerationDetail } from '../hooks'
import type { SafetyChecklist } from '../types'

const tickedKeys = (stored: SafetyChecklist): SafetyChecklistKey[] =>
  (Object.keys(stored) as SafetyChecklistKey[]).filter((key) => stored[key])

// UC27: the Admin looks at one post (photos, details, owner, warnings), goes through the safety
// checklist and approves it, or rejects it.
export function ToyModerationReviewPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const backTo = queuePathFrom(location.state, adminPaths.toys)
  const detail = useToyModerationDetail(id)
  const toy = detail.data
  // The ticks belong to the version the Admin checked: when the post changes (a 409 refetch after
  // an Owner edit), the checklist starts again.
  const [checklist, setChecklist] = useState<{ version: string; items: SafetyChecklistKey[] }>({
    version: '',
    items: [],
  })

  const breadcrumb = [
    adminHomeCrumb,
    { title: 'Duyệt tin đăng', to: backTo },
    { title: toy?.title ?? 'Chi tiết tin đăng' },
  ]

  if (!toy) {
    return (
      <>
        <PageHeader title="Chi tiết tin đăng" breadcrumb={breadcrumb} />
        {detail.error ? (
          <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
      </>
    )
  }

  const version = `${toy.id}@${toy.updatedAt}`
  const checkedItems = checklist.version === version ? checklist.items : []
  const storedChecklist = toy.moderation.safetyChecklist

  return (
    <>
      <PageHeader
        title={toy.title}
        description={`Mã tin: ${toy.id}`}
        breadcrumb={breadcrumb}
        actions={<ModerationActions toy={toy} backTo={backTo} checkedItems={checkedItems} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <div className="flex flex-col gap-4">
            <ModerationWarnings warnings={toy.warnings} />
            <Card title={`Ảnh (${toy.images.length} ảnh, tối thiểu ${toy.minPhotos})`}>
              <ImageGallery size={120} images={toy.images} />
            </Card>
            <ToyDetailsCard toy={toy} />
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <div className="flex flex-col gap-4">
            {toy.status === 'pending' ? (
              <SafetyChecklistCard
                value={checkedItems}
                onChange={(items) => setChecklist({ version, items })}
              />
            ) : (
              storedChecklist && (
                <SafetyChecklistCard value={tickedKeys(storedChecklist)} readOnly />
              )
            )}
            <ModerationStatusCard toy={toy} />
            <OwnerCard owner={toy.owner} />
          </div>
        </Col>
      </Row>
    </>
  )
}
