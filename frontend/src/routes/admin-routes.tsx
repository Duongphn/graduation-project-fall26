import type { RouteObject } from 'react-router-dom'

import { lazyPage } from './lazy-page'
import { adminChildPath, adminPaths } from './paths'

// Child routes of /admin. Each feature adds ONE block here and ONE entry in admin-menu.tsx.
// Pages live in src/features/<feature>/pages and are loaded with lazyPage.
export const adminRoutes: RouteObject[] = [
  // Toy moderation (UC27)
  { path: adminChildPath(adminPaths.toys), ...lazyPage(() => import('../features/toy-moderation/pages/ToyModerationQueuePage'), 'ToyModerationQueuePage') },
  { path: adminChildPath(adminPaths.toys, '/:id'), ...lazyPage(() => import('../features/toy-moderation/pages/ToyModerationReviewPage'), 'ToyModerationReviewPage') },
  // Identity review (UC27, FE-01)
  { path: adminChildPath(adminPaths.identityVerifications), ...lazyPage(() => import('../features/identity-verifications/pages/IdentityVerificationListPage'), 'IdentityVerificationListPage') },
  { path: adminChildPath(adminPaths.identityVerifications, '/:id'), ...lazyPage(() => import('../features/identity-verifications/pages/IdentityVerificationDetailPage'), 'IdentityVerificationDetailPage') },
  // Toy categories (UC30)
  { path: adminChildPath(adminPaths.categories), ...lazyPage(() => import('../features/categories/pages/CategoriesPage'), 'CategoriesPage') },
  // Charity organizations (FE-02, UC34)
  { path: adminChildPath(adminPaths.organizations), ...lazyPage(() => import('../features/organizations/pages/OrganizationsPage'), 'OrganizationsPage') },
  // Donation requests (FE-02, BF-04)
  { path: adminChildPath(adminPaths.donationRequests), ...lazyPage(() => import('../features/donations/pages/AdminDonationRequestsPage'), 'AdminDonationRequestsPage') },
  { path: adminChildPath(adminPaths.donationRequests, '/:id'), ...lazyPage(() => import('../features/donations/pages/AdminDonationRequestDetailPage'), 'AdminDonationRequestDetailPage') },
  // Rental disputes (UC19)
  { path: adminChildPath(adminPaths.disputes), ...lazyPage(() => import('../features/disputes/pages/DisputeListPage'), 'DisputeListPage') },
  { path: adminChildPath(adminPaths.disputes, '/:id'), ...lazyPage(() => import('../features/disputes/pages/DisputeDetailPage'), 'DisputeDetailPage') },
  // Notifications (UC26): the bell in the header opens the latest ones
  { path: adminChildPath(adminPaths.notifications), ...lazyPage(() => import('../features/notifications/pages/AdminNotificationsPage'), 'AdminNotificationsPage') },
  // Violation reports (UC29)
  { path: adminChildPath(adminPaths.violationReports), ...lazyPage(() => import('../features/violation-reports/pages/ViolationReportListPage'), 'ViolationReportListPage') },
  { path: adminChildPath(adminPaths.violationReports, '/:id'), ...lazyPage(() => import('../features/violation-reports/pages/ViolationReportDetailPage'), 'ViolationReportDetailPage') },
  // User accounts (UC29)
  { path: adminChildPath(adminPaths.users), ...lazyPage(() => import('../features/accounts/pages/AccountListPage'), 'AccountListPage') },
  { path: adminChildPath(adminPaths.users, '/:id'), ...lazyPage(() => import('../features/accounts/pages/AccountDetailPage'), 'AccountDetailPage') },
  // Audit log (UC31)
  { path: adminChildPath(adminPaths.withdrawals), ...lazyPage(() => import('../features/withdrawal-requests/pages/AdminWithdrawalsPage'), 'AdminWithdrawalsPage') },

  { path: adminChildPath(adminPaths.auditLogs), ...lazyPage(() => import('../features/audit-logs/pages/AuditLogPage'), 'AuditLogPage') },
  // System settings (UC30): fees, limits, time limits; ?edit=<key> opens Setting Detail
  { path: adminChildPath(adminPaths.settings), ...lazyPage(() => import('../features/system-settings/pages/SystemSettingsPage'), 'SystemSettingsPage') },
]
