import type { Request, Response } from 'express';

import { getValidatedQuery } from '../middlewares/validate.js';
import * as service from '../services/audit-log.service.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import type { AuditLogQuery } from '../validations/audit-log.validation.js';

// GET /api/v1/admin/audit-logs
export const list = async (_request: Request, response: Response): Promise<void> => {
  const query = getValidatedQuery<AuditLogQuery>(response);
  const { items, totalItems } = await service.listAuditLogs(query);
  sendPaginated(response, items, query, totalItems);
};

// GET /api/v1/admin/audit-logs/filters
export const filters = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(response, await service.getFilterOptions());
};
