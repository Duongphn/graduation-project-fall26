import { Types, type ClientSession, type FilterQuery } from 'mongoose';

import { writeAuditLog, type AuditEntry } from '../../infrastructure/database/audit.js';
import { vietnameseNameCollation } from '../../infrastructure/database/schema-types.js';
import { openDonationStatuses, type VisibilityStatus } from '../../shared/domain/statuses.js';
import { DonationRequestModel } from '../donation_requests/donation_requests.model.js';
import { OrganizationModel, type Organization } from './organizations.model.js';

// Database access of the organization feature. Donation requests are only counted here; they
// belong to the donations feature.

export type OrganizationRecord = Organization & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface RequestCounts {
  openRequestCount: number;
  requestCount: number;
}

export interface Paging {
  skip: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

export const noRequests: RequestCounts = { openRequestCount: 0, requestCount: 0 };

/** Request counts of several organizations ("organization_requests" index). */
export const countRequestsByOrganization = async (
  ids: Types.ObjectId[],
  session?: ClientSession,
): Promise<Map<string, RequestCounts>> => {
  const counts = new Map<string, RequestCounts>();
  if (ids.length === 0) return counts;
  const rows = await DonationRequestModel.aggregate<{
    _id: Types.ObjectId;
    total: number;
    open: number;
  }>([
    { $match: { receiverType: 'ORGANIZATION', organizationId: { $in: ids } } },
    {
      $group: {
        _id: '$organizationId',
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $in: ['$status', [...openDonationStatuses]] }, 1, 0] } },
      },
    },
  ]).session(session ?? null);
  for (const row of rows) {
    counts.set(String(row._id), { openRequestCount: row.open, requestCount: row.total });
  }
  return counts;
};

export const countRequests = async (
  id: Types.ObjectId,
  session?: ClientSession,
): Promise<RequestCounts> =>
  (await countRequestsByOrganization([id], session)).get(String(id)) ?? noRequests;

export const findOrganizationsPage = async (
  filter: FilterQuery<OrganizationRecord>,
  paging: Paging,
): Promise<{ items: OrganizationRecord[]; total: number }> => {
  const [items, total] = await Promise.all([
    OrganizationModel.find(filter)
      .collation(vietnameseNameCollation)
      .sort(paging.sort)
      .skip(paging.skip)
      .limit(paging.limit)
      .lean<OrganizationRecord[]>(),
    OrganizationModel.countDocuments(filter).collation(vietnameseNameCollation),
  ]);
  return { items, total };
};

export const findOrganization = (
  id: string,
  options: { status?: VisibilityStatus; session?: ClientSession } = {},
) =>
  OrganizationModel.findOne({ _id: id, ...(options.status ? { status: options.status } : {}) })
    .session(options.session ?? null)
    .lean<OrganizationRecord>();

export const insertOrganization = async (
  data: Record<string, unknown>,
  audit: (record: OrganizationRecord) => AuditEntry,
  session: ClientSession,
): Promise<OrganizationRecord> => {
  const [created] = await OrganizationModel.create([data], { session });
  const record = created!.toObject() as OrganizationRecord;
  await writeAuditLog(audit(record), session);
  return record;
};

/** Applies `$set`/`$unset` and runs schema validators. Null when the organization is gone. */
export const updateOrganizationFields = (
  id: Types.ObjectId,
  set: Record<string, unknown>,
  unset: string[],
  session: ClientSession,
) =>
  OrganizationModel.findOneAndUpdate(
    { _id: id },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((field) => [field, 1])) } : {}),
    },
    { new: true, runValidators: true, session },
  ).lean<OrganizationRecord>();

/** Moves the status only if nobody changed it in the meantime (conditional update). */
export const changeStatus = (
  id: Types.ObjectId,
  from: VisibilityStatus,
  to: VisibilityStatus,
  session: ClientSession,
) =>
  OrganizationModel.findOneAndUpdate(
    { _id: id, status: from },
    { $set: { status: to } },
    { new: true, session },
  ).lean<OrganizationRecord>();

export const deleteOrganization = async (
  id: Types.ObjectId,
  session: ClientSession,
): Promise<boolean> => {
  const result = await OrganizationModel.deleteOne({ _id: id }, { session });
  return result.deletedCount === 1;
};
