import type { Request, Response } from 'express';

import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../middlewares/validate.js';
import * as adminService from '../services/violation-report-admin.service.js';
import * as service from '../services/violation-report.service.js';
import { getAdminContext, getRequestUserId } from '../utils/admin-context.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import type { IdParams } from '../validations/common.validation.js';
import type {
  AdminReportCountsQuery,
  AdminReportListQuery,
  CreateReportBody,
  ResolveReportBody,
} from '../validations/violation-report.validation.js';

// POST /api/v1/violation-reports
export const create = async (request: Request, response: Response): Promise<void> => {
  const report = await service.createReport(
    getRequestUserId(request),
    getValidatedBody<CreateReportBody>(request),
  );
  sendCreated(response, report, 'Đã gửi báo cáo. Admin sẽ xem xét sớm.');
};

// GET /api/v1/admin/violation-reports
export const list = async (_request: Request, response: Response): Promise<void> => {
  const query = getValidatedQuery<AdminReportListQuery>(response);
  const { items, totalItems } = await adminService.listReports(query);
  sendPaginated(response, items, query, totalItems);
};

// GET /api/v1/admin/violation-reports/counts
export const counts = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(
    response,
    await adminService.countReportsByStatus(getValidatedQuery<AdminReportCountsQuery>(response)),
  );
};

// GET /api/v1/admin/violation-reports/:id
export const detail = async (_request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  sendSuccess(response, await adminService.getReportDetail(id));
};

// POST /api/v1/admin/violation-reports/:id/resolve
export const resolve = async (request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await adminService.resolveReport(
    id,
    getValidatedBody<ResolveReportBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, result, {
    message: result.status === 'dismissed' ? 'Đã bỏ qua báo cáo.' : 'Đã xử lý báo cáo.',
  });
};
