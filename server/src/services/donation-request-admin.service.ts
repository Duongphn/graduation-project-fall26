import { Types } from 'mongoose';

import type { AdminContext } from '../utils/admin-context.js';
import { zeroFilledCounts } from '../utils/counts.js';
import { escapeRegex, accentInsensitivePattern, provinceNamePattern } from '../utils/text.js';
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
import { donationSettings } from './donation-request.transition.js';

// Admin use cases: the queue of every request; the decision on a request a Donor sent to an
// organization (GB-56; the Donor decides the others: 409 DONOR_DECISION_REQUIRED); requests and
// receipt confirmation on behalf of an ACTIVE organization (GB-59); and the way out of a stuck
// SHIPPING request (cancel, or confirm receipt for a USER receiver with a reason). Every move is
// audited.

export const toActor = (context: AdminContext): DonationActor => ({
  userId: context.actor.actorId,
  isAdmin: true,
  ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
});

const DAY_MS = 24 * 60 * 60 * 1000;

// R03 III.7.5.2 and UC35 step 1: status, receiver type, organization, province of its receiving
// point, overdue confirmation and a search. Each filter is one clause of an $and.
const buildFilter = async (filters: AdminFilters): Promise<RequestFilter> => {
  const clauses: RequestFilter[] = [];
  if (filters.receiverType) {
    clauses.push({
      'receiver.organizationId': { $exists: filters.receiverType === 'ORGANIZATION' },
    });
  }
  if (filters.organizationId) {
    clauses.push({ 'receiver.organizationId': new Types.ObjectId(filters.organizationId) });
  }
  if (filters.province) {
    const organizationIds = await repository.findOrganizationIdsByProvince(
      provinceNamePattern(filters.province),
    );
    clauses.push({ 'receiver.organizationId': { $in: organizationIds } });
  }
  if (filters.overdue !== undefined) {
    // GB-57: shipping, handed over more than DONATION_CONFIRM_DAYS ago.
    const { confirmDays } = await donationSettings();
    const sentBefore = {
      step: 'DONOR_SENT',
      at: { $lt: new Date(Date.now() - confirmDays * DAY_MS) },
    };
    const overdue = { status: 'shipping', handovers: { $elemMatch: sentBefore } };
    clauses.push(filters.overdue ? overdue : { $nor: [overdue] });
  }
  if (filters.q) {
    const toyIds = await repository.findDonationToyIdsByTitle(accentInsensitivePattern(filters.q));
    clauses.push({
      $or: [
        { code: { $regex: `^${escapeRegex(filters.q.toUpperCase())}` } },
        { toyId: { $in: toyIds } },
      ],
    });
  }
  return clauses.length > 0 ? { $and: clauses } : {};
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

/** Also the way out of a stuck SHIPPING request: the toy stays hidden (GB-60, audited). */
export const cancel = (context: AdminContext, id: string, reason: string) =>
  service.cancel(toActor(context), id, { note: reason });

export const confirmReceived = (
  context: AdminContext,
  id: string,
  { reason, confirmedBy, channel, receivedAt, ...body }: AdminConfirmReceivedBody,
) =>
  service.confirmReceived(toActor(context), id, body, {
    reason,
    receipt: { confirmedBy, channel, receivedAt },
  });
