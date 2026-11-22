import type {
  LockDuration,
  ReportAction,
  ReportReason,
  ReportStatus,
  ReportTargetKind,
  ToyStatus,
  UnsafeIssue,
  UserRole,
  UserStatus,
} from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Responses of /admin/violation-reports (server/src/validations/violation-report.validation.ts).

export interface ReportPerson {
  id: string
  fullName: string | null
}

export interface ReportResolution {
  action: ReportAction
  lockDuration: LockDuration | null
  note: string | null
  resolvedAt: string | null
  resolvedBy: ReportPerson | null
  // Set when the report was closed together with another report on the same target.
  viaReportId: string | null
}

export interface ReportListItem {
  id: string
  status: ReportStatus
  reason: ReportReason
  isUnsafe: boolean
  unsafeIssues: UnsafeIssue[]
  description: string
  // label: toy title, user name or the start of the message; null when it is gone.
  target: { kind: ReportTargetKind; id: string; label: string | null }
  reporter: ReportPerson | null
  reportedUser: ReportPerson | null
  evidenceCount: number
  resolution: ReportResolution | null
  createdAt: string
}

export interface ReportedUserSummary {
  id: string
  fullName: string
  maskedPhone: string
  role: UserRole
  accountStatus: UserStatus
  lockedUntil: string | null
  violationCount: number
  pendingReportCount: number
}

export interface ReportDetail extends Omit<ReportListItem, 'reporter' | 'reportedUser'> {
  reporter: (ReportPerson & { maskedPhone: string }) | null
  reportedUser: ReportedUserSummary | null
  toy: {
    id: string
    title: string
    status: ToyStatus
    listingType: string
    coverImage: string | null
    rejectReason: string | null
  } | null
  message: { id: string; content: string; sentAt: string; conversationId: string } | null
  // Signed links valid a few minutes; url null when Cloudinary is not configured.
  evidence: Array<{ url: string | null; expiresAt: string | null }>
  otherPendingReports: number
}

export type ReportStatusCounts = Record<ReportStatus, number>

export interface ReportFilters {
  reason?: ReportReason
  targetKind?: ReportTargetKind
}

export interface ReportListParams extends PaginationParams, ReportFilters {
  status: ReportStatus
}

export interface ResolveReportInput {
  action: ReportAction
  lockDuration?: LockDuration
  note: string
}

export interface ResolveReportResult {
  id: string
  status: 'resolved' | 'dismissed'
  action: ReportAction
  closedReportIds: string[]
}

// POST /violation-reports (the user report form, UC28).
export interface CreateReportInput {
  targetKind: ReportTargetKind
  targetId: string
  reason: ReportReason
  // Required with reason unsafe_toy, not allowed otherwise.
  unsafeIssues?: UnsafeIssue[]
  description: string
  // Private uploads with purpose REPORT_EVIDENCE, at most 5.
  evidence?: Array<{ publicId: string; format: string }>
}
