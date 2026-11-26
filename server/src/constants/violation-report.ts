// Violation reports (UC28) and their handling (UC29). Stored values are lowercase (R04 I.3).

/** What is reported (R04 3.21 target.kind). */
export const reportTargetKinds = ['toy', 'user', 'message'] as const;
export type ReportTargetKind = (typeof reportTargetKinds)[number];

/** The fixed list of reasons. "unsafe_toy" is for toy posts only and comes first (GB-49). */
export const reportReasons = [
  'unsafe_toy',
  'scam',
  'wrong_description',
  'prohibited_item',
  'contact_outside',
  'harassment',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof reportReasons)[number];

export const UNSAFE_REASON: ReportReason = 'unsafe_toy';

/** What is wrong with an unsafe toy (R03 II.7.3 step 2). */
export const unsafeIssues = [
  'small_parts',
  'broken_or_sharp',
  'battery',
  'recalled',
  'smell_or_paint',
  'other',
] as const;
export type UnsafeIssue = (typeof unsafeIssues)[number];

export const reportStatuses = ['pending', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof reportStatuses)[number];

/** Admin actions on a report (UC29). */
export const reportActions = ['dismiss', 'remove_listing', 'warn', 'lock'] as const;
export type ReportAction = (typeof reportActions)[number];

/** Account lock lengths (UC29, R03 III.7.2.1 (8)). */
export const lockDurations = ['7d', '30d', 'permanent'] as const;
export type LockDuration = (typeof lockDurations)[number];

export const LOCK_DURATION_DAYS: Record<Exclude<LockDuration, 'permanent'>, number> = {
  '7d': 7,
  '30d': 30,
};

/** Spam guard (R03 III.6.3.1 (3)): at most this many reports per reporter in 24 hours. */
export const REPORT_DAILY_LIMIT = 10;
export const REPORT_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Evidence photos per report. */
export const MAX_REPORT_EVIDENCE = 5;
