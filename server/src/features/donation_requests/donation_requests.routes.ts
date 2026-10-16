import { Router } from 'express';
import type { ZodType } from 'zod';

import { emptyObjectSchema, idParamsSchema } from '../../shared/http/schemas.js';
import { requireAdmin, requireUser } from '../../shared/middleware/auth-placeholder.js';
import { validateRequest } from '../../shared/middleware/validate.js';
import * as controller from './donation_requests.controller.js';
import {
  adminCancelBodySchema,
  adminConfirmReceivedBodySchema,
  adminCreateRequestBodySchema,
  adminFiltersSchema,
  adminListQuerySchema,
  cancelBodySchema,
  confirmReceivedBodySchema,
  createRequestBodySchema,
  handoverBodySchema,
  myRequestsQuerySchema,
  rejectBodySchema,
  userParamsSchema,
} from './donation_requests.schemas.js';

const byId = (body: ZodType = emptyObjectSchema) =>
  validateRequest({ params: idParamsSchema, body });

// Mounted at /api/v1/donation-requests: receivers and donors.
export const donationRequestsRouter = Router();
donationRequestsRouter.use(requireUser);

donationRequestsRouter.post(
  '/',
  validateRequest({ body: createRequestBodySchema }),
  controller.create,
);
donationRequestsRouter.get(
  '/mine',
  validateRequest({ query: myRequestsQuerySchema }),
  controller.listMine,
);
donationRequestsRouter.get(
  '/incoming',
  validateRequest({ query: myRequestsQuerySchema }),
  controller.listIncoming,
);
donationRequestsRouter.get('/:id', validateRequest({ params: idParamsSchema }), controller.getOne);
donationRequestsRouter.post('/:id/accept', byId(), controller.accept);
donationRequestsRouter.post('/:id/reject', byId(rejectBodySchema), controller.reject);
donationRequestsRouter.post('/:id/cancel', byId(cancelBodySchema), controller.cancel);
donationRequestsRouter.post('/:id/handover', byId(handoverBodySchema), controller.handOver);
donationRequestsRouter.post(
  '/:id/confirm-received',
  byId(confirmReceivedBodySchema),
  controller.confirmReceived,
);

// Mounted at /api/v1/admin/donation-requests.
export const adminDonationRequestsRouter = Router();
adminDonationRequestsRouter.use(requireAdmin);

adminDonationRequestsRouter.get(
  '/',
  validateRequest({ query: adminListQuerySchema }),
  controller.adminList,
);
adminDonationRequestsRouter.get(
  '/counts',
  validateRequest({ query: adminFiltersSchema }),
  controller.adminCounts,
);
adminDonationRequestsRouter.post(
  '/',
  validateRequest({ body: adminCreateRequestBodySchema }),
  controller.adminCreate,
);
adminDonationRequestsRouter.get(
  '/:id',
  validateRequest({ params: idParamsSchema }),
  controller.adminDetail,
);
adminDonationRequestsRouter.post('/:id/accept', byId(), controller.adminAccept);
adminDonationRequestsRouter.post('/:id/reject', byId(rejectBodySchema), controller.adminReject);
adminDonationRequestsRouter.post(
  '/:id/cancel',
  byId(adminCancelBodySchema),
  controller.adminCancel,
);
adminDonationRequestsRouter.post(
  '/:id/confirm-received',
  byId(adminConfirmReceivedBodySchema),
  controller.adminConfirmReceived,
);

// Mounted at /api/v1/users: public donor profile figure.
export const donorProfileRouter = Router();

donorProfileRouter.get(
  '/:userId/donation-summary',
  validateRequest({ params: userParamsSchema }),
  controller.donorSummary,
);
