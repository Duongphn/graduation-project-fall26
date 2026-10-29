import type { Request, Response } from 'express';

import { getAdminContext, getRequestUserId } from '../utils/admin-context.js';
import type { IdParams } from '../validations/common.validation.js';
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../middlewares/validate.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import * as admin from '../services/donation-request-admin.service.js';
import type { DonationActor } from '../services/donation-request.policy.js';
import type {
  AdminCancelBody,
  AdminConfirmReceivedBody,
  AdminCreateRequestBody,
  AdminFilters,
  AdminListQuery,
  CancelBody,
  ConfirmReceivedBody,
  CreateRequestBody,
  HandoverBody,
  MyRequestsQuery,
  RejectBody,
  UserParams,
} from '../validations/donation-request.validation.js';
import * as service from '../services/donation-request.service.js';

// HTTP adapters only: validated input in, envelope out. Bodies were parsed by validateRequest.

/**
 * Users act as themselves on the user routes, even when their role is ADMIN: an Admin who
 * filed a request for an organization acts on it only through the /admin routes (audited).
 */
const userActor = (request: Request): DonationActor => ({
  userId: getRequestUserId(request),
  isAdmin: false,
});

const MESSAGES = {
  accepted: 'Đã chấp nhận yêu cầu nhận tặng.',
  rejected: 'Đã từ chối yêu cầu nhận tặng.',
  cancelled: 'Đã hủy yêu cầu nhận tặng.',
  handedOver: 'Đã ghi nhận bàn giao đồ chơi.',
  completed: 'Đã xác nhận nhận đồ chơi. Quyên góp hoàn tất.',
} as const;

const idOf = (response: Response) => getValidatedParams<IdParams>(response).id;

// ---- Receiver and donor ----------------------------------------------------------------------

export const create = async (request: Request, response: Response) => {
  const body = getValidatedBody<CreateRequestBody>(request);
  sendCreated(response, await service.createRequest(userActor(request), body));
};

export const listMine = async (request: Request, response: Response) => {
  const query = getValidatedQuery<MyRequestsQuery>(response);
  const { items, total } = await service.listMine(userActor(request), query);
  sendPaginated(response, items, query, total);
};

export const listIncoming = async (request: Request, response: Response) => {
  const query = getValidatedQuery<MyRequestsQuery>(response);
  const { items, total } = await service.listIncoming(userActor(request), query);
  sendPaginated(response, items, query, total);
};

export const getOne = async (request: Request, response: Response) => {
  sendSuccess(response, await service.getRequest(userActor(request), idOf(response)));
};

export const accept = async (request: Request, response: Response) => {
  sendSuccess(response, await service.accept(userActor(request), idOf(response)), {
    message: MESSAGES.accepted,
  });
};

export const reject = async (request: Request, response: Response) => {
  const { reason } = getValidatedBody<RejectBody>(request);
  sendSuccess(response, await service.reject(userActor(request), idOf(response), reason), {
    message: MESSAGES.rejected,
  });
};

export const cancel = async (request: Request, response: Response) => {
  const body = getValidatedBody<CancelBody>(request);
  sendSuccess(response, await service.cancel(userActor(request), idOf(response), body), {
    message: MESSAGES.cancelled,
  });
};

export const handOver = async (request: Request, response: Response) => {
  const body = getValidatedBody<HandoverBody>(request);
  sendSuccess(response, await service.handOver(userActor(request), idOf(response), body), {
    message: MESSAGES.handedOver,
  });
};

export const confirmReceived = async (request: Request, response: Response) => {
  const body = getValidatedBody<ConfirmReceivedBody>(request);
  sendSuccess(response, await service.confirmReceived(userActor(request), idOf(response), body), {
    message: MESSAGES.completed,
  });
};

export const donorSummary = async (_request: Request, response: Response) => {
  const { userId } = getValidatedParams<UserParams>(response);
  sendSuccess(response, await service.getDonorSummary(userId));
};

// ---- Admin -----------------------------------------------------------------------------------

export const adminList = async (_request: Request, response: Response) => {
  const query = getValidatedQuery<AdminListQuery>(response);
  const { items, total } = await admin.list(query);
  sendPaginated(response, items, query, total);
};

export const adminCounts = async (_request: Request, response: Response) => {
  sendSuccess(response, await admin.counts(getValidatedQuery<AdminFilters>(response)));
};

export const adminDetail = async (request: Request, response: Response) => {
  sendSuccess(response, await admin.detail(getAdminContext(request), idOf(response)));
};

export const adminCreate = async (request: Request, response: Response) => {
  const body = getValidatedBody<AdminCreateRequestBody>(request);
  sendCreated(response, await admin.create(getAdminContext(request), body));
};

export const adminAccept = async (request: Request, response: Response) => {
  sendSuccess(response, await admin.accept(getAdminContext(request), idOf(response)), {
    message: MESSAGES.accepted,
  });
};

export const adminReject = async (request: Request, response: Response) => {
  const { reason } = getValidatedBody<RejectBody>(request);
  sendSuccess(response, await admin.reject(getAdminContext(request), idOf(response), reason), {
    message: MESSAGES.rejected,
  });
};

export const adminCancel = async (request: Request, response: Response) => {
  const { reason } = getValidatedBody<AdminCancelBody>(request);
  sendSuccess(response, await admin.cancel(getAdminContext(request), idOf(response), reason), {
    message: MESSAGES.cancelled,
  });
};

export const adminConfirmReceived = async (request: Request, response: Response) => {
  const body = getValidatedBody<AdminConfirmReceivedBody>(request);
  sendSuccess(
    response,
    await admin.confirmReceived(getAdminContext(request), idOf(response), body),
    { message: MESSAGES.completed },
  );
};
