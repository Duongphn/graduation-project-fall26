import './donation-request.openapi.js';
import { Router } from 'express';
import type { ZodType } from 'zod';

import { emptyObjectSchema, idParamsSchema } from '../validations/common.validation.js';
import { requireActor } from '../middlewares/require-actor.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import * as controller from '../controllers/donation-request.controller.js';
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
} from '../validations/donation-request.validation.js';

const byId = (body: ZodType = emptyObjectSchema) =>
  validateRequest({ params: idParamsSchema, body });

// Mounted at /api/v1/donation-requests (after develop's authenticate): receivers and donors.
export const donationRequestsRouter = Router();
donationRequestsRouter.use(requireActor);

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

// Mounted at /api/v1/admin/donation-requests (after develop's authenticate).
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

// Mounted at /api/v1/donors (public, no authenticate): donor profile figure.
// Not under /users: develop mounts authenticate + its users router there.
export const donorProfileRouter = Router();

donorProfileRouter.get(
  '/:userId/donation-summary',
  validateRequest({ params: userParamsSchema }),
  controller.donorSummary,
);
