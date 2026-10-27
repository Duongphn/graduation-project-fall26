import { Types } from 'mongoose';

import type { AdminContext } from '../utils/admin-context.js';
import { zeroFilledCounts } from '../utils/counts.js';
import { escapeRegex, accentInsensitivePattern } from '../utils/text.js';
import type { DonationActor } from './donation-request.policy.js';
import * as repository from '../repositories/donation-request.repository.js';
import { storedDonationStatuses } from '../constants/donation-request-transitions.js';
import type { RequestFilter } from '../repositories/donation-request.repository.js';
import type {
  AdminConfirmReceivedBody,
  AdminCreateRequestBody,
  AdminFilters,
  AdminListQuery,
} from '../validations/donation-request.validation.js';
import * as service from './donation-request.service.js';

// Admin use cases: the queue of every request (no decisions: accept/reject answer 409
// DONOR_DECISION_REQUIRED, D-04), requests and receipt
// confirmation on behalf of an ACTIVE organization, and the way out of a stuck SHIPPING request
// (cancel, or confirm receipt for a USER receiver with a reason). Every move is audited.

export const toActor = (context: AdminContext): DonationActor => ({
  userId: context.actor.actorId,
  isAdmin: true,
  ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
});

const buildFilter = async (filters: AdminFilters): Promise<RequestFilter> => {
  const filter: RequestFilter = {};
  if (filters.receiverType) {
    filter['receiver.organizationId'] = { $exists: filters.receiverType === 'ORGANIZATION' };
  }
  if (filters.organizationId) {
    filter['receiver.organizationId'] = new Types.ObjectId(filters.organizationId);
  }
  if (filters.q) {
    const toyIds = await repository.findDonationToyIdsByTitle(accentInsensitivePattern(filters.q));
    filter.$or = [
      { code: { $regex: `^${escapeRegex(filters.q.toUpperCase())}` } },
      { toyId: { $in: toyIds } },
    ];
  }
  return filter;
};

export const list = async (query: AdminListQuery) => {
  const filter = await buildFilter(query);
  if (query.status) filter.status = query.status;
  return service.listPage(filter, query, { admin: true });
};

/** Number of requests per status for the StatusTabs (same filters, any status). */
export const counts = async (filters: AdminFilters) => {
  const rows = await repository.countRequestsByStatus(await buildFilter(filters));
  return zeroFilledCounts(storedDonationStatuses, rows);
};

export const detail = (context: AdminContext, id: string) =>
  service.getRequest(toActor(context), id);

export const create = (context: AdminContext, body: AdminCreateRequestBody) =>
  service.createRequest(toActor(context), body);

export const accept = (context: AdminContext, id: string) => service.accept(toActor(context), id);

export const reject = (context: AdminContext, id: string, reason: string) =>
  service.reject(toActor(context), id, reason);

/** Also the way out of a stuck SHIPPING request: the toy goes back to ACTIVE (audited). */
export const cancel = (context: AdminContext, id: string, reason: string) =>
  service.cancel(toActor(context), id, { note: reason });

export const confirmReceived = (
  context: AdminContext,
  id: string,
  { reason, ...body }: AdminConfirmReceivedBody,
) => service.confirmReceived(toActor(context), id, body, { reason });
