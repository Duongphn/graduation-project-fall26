import { randomBytes } from 'node:crypto';

import { Types, type ClientSession } from 'mongoose';

import type { ActorReference } from '../../shared/contracts/actor.js';
import type { DonationStatus, ToyStatus } from '../../shared/domain/statuses.js';
import { isDuplicateKeyError } from '../../shared/utils/mongo-errors.js';
import { OrderStatusHistoryModel } from '../order_status_history/order_status_history.model.js';
import { OrganizationModel } from '../organizations/organizations.model.js';
import { ToyModel } from '../toys/toys.model.js';
import { UserModel } from '../users/users.model.js';
import { DonationRequestModel, type DonationRequest } from './donation_requests.model.js';

// The only file of this feature that touches models (features/README.md rule 6). It also
// reads and writes the toy, organization and user models the donation flow depends on.

export type DonationRecord = DonationRequest & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id);

const toySummaryFields = 'ownerId title images condition ageGroup listingType status';

// ---- Single documents ----------------------------------------------------------------------

export const findRequestById = (id: string, session?: ClientSession) =>
  DonationRequestModel.findById(id)
    .session(session ?? null)
    .lean<DonationRecord>();

export const findToy = (toyId: string | Types.ObjectId, session?: ClientSession) =>
  ToyModel.findById(toyId)
    .select(toySummaryFields)
    .session(session ?? null)
    .lean();

export const findOrganization = (id: string | Types.ObjectId, session?: ClientSession) =>
  OrganizationModel.findById(id)
    .select('name status')
    .session(session ?? null)
    .lean();

export const userExists = async (userId: string): Promise<boolean> =>
  (await UserModel.exists({ _id: oid(userId) })) !== null;

// ---- Writes (always inside the caller's transaction) -----------------------------------------

// The "touch" writes below bump __v (timestamps untouched) only while the document is still in
// the expected state. A create transaction then writes the same document as a concurrent
// accept (toy), hide or delete (organization), so MongoDB aborts one of them with a write
// conflict and withTransaction retries it with fresh data. A plain read would not conflict.

/** The DONATION toy, if it is still ACTIVE (else null). */
export const touchActiveDonationToy = (toyId: string | Types.ObjectId, session: ClientSession) =>
  ToyModel.findOneAndUpdate(
    { _id: oid(toyId), status: 'ACTIVE', listingType: 'DONATION' },
    { $inc: { __v: 1 } },
    { new: true, session, timestamps: false, projection: toySummaryFields },
  ).lean();

/** The organization, if it is still ACTIVE (else null). */
export const touchActiveOrganization = (id: string | Types.ObjectId, session: ClientSession) =>
  OrganizationModel.findOneAndUpdate(
    { _id: oid(id), status: 'ACTIVE' },
    { $inc: { __v: 1 } },
    { new: true, session, timestamps: false, projection: 'name status' },
  ).lean();

const newCode = (): string => `DN${randomBytes(5).toString('hex').toUpperCase()}`;
const CODE_ATTEMPTS = 3;

/** Inserts a PENDING request with a fresh code (retried on the rare code clash). */
export const insertRequest = async (
  data: {
    toyId: Types.ObjectId;
    donorId: Types.ObjectId;
    requestedBy: string;
    receiverType: 'USER' | 'ORGANIZATION';
    organizationId?: string;
    message?: string;
  },
  session: ClientSession,
): Promise<DonationRecord> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const [created] = await DonationRequestModel.create(
        [
          {
            ...data,
            requestedBy: oid(data.requestedBy),
            ...(data.organizationId ? { organizationId: oid(data.organizationId) } : {}),
            code: newCode(),
            status: 'PENDING',
          },
        ],
        { session },
      );
      return created!.toObject() as DonationRecord;
    } catch (error) {
      if (attempt < CODE_ATTEMPTS && isDuplicateKeyError(error, 'code_unique')) continue;
      throw error;
    }
  }
};

/** Conditional status move: null when the request is no longer in `from`. */
export const updateRequestStatus = (
  id: Types.ObjectId,
  from: DonationStatus,
  to: DonationStatus,
  changes: { set?: Record<string, unknown>; pushHandover?: Record<string, unknown> },
  session: ClientSession,
) =>
  DonationRequestModel.findOneAndUpdate(
    { _id: id, status: from },
    {
      $set: { ...changes.set, status: to },
      ...(changes.pushHandover ? { $push: { handovers: changes.pushHandover } } : {}),
    },
    { new: true, session, runValidators: true },
  ).lean<DonationRecord>();

/** Conditional toy move: false when the toy is no longer in `from`. */
export const moveToy = async (
  toyId: Types.ObjectId,
  from: ToyStatus,
  to: ToyStatus,
  session: ClientSession,
): Promise<boolean> => {
  const result = await ToyModel.updateOne(
    { _id: toyId, status: from },
    { $set: { status: to } },
    {
      session,
    },
  );
  return result.modifiedCount === 1;
};

/** Rejects every other PENDING request of the toy; returns the rejected requests. */
export const rejectPendingSiblings = async (
  toyId: Types.ObjectId,
  acceptedId: Types.ObjectId,
  decision: { decidedBy: Types.ObjectId; decidedAt: Date; rejectReason: string },
  session: ClientSession,
): Promise<DonationRecord[]> => {
  const siblings = await DonationRequestModel.find({
    toyId,
    status: 'PENDING',
    _id: { $ne: acceptedId },
  })
    .session(session)
    .lean<DonationRecord[]>();
  if (siblings.length === 0) return [];
  await DonationRequestModel.updateMany(
    { _id: { $in: siblings.map((item) => item._id) }, status: 'PENDING' },
    { $set: { ...decision, status: 'REJECTED' } },
    { session },
  );
  return siblings;
};

export interface HistoryRow {
  orderId: Types.ObjectId;
  fromStatus?: DonationStatus;
  toStatus: DonationStatus;
  actor: ActorReference;
  reason?: string;
}

export const insertHistory = async (rows: HistoryRow[], session: ClientSession) => {
  if (rows.length === 0) return;
  await OrderStatusHistoryModel.insertMany(
    rows.map((row) => ({
      orderType: 'DONATION',
      orderId: row.orderId,
      ...(row.fromStatus ? { fromStatus: row.fromStatus } : {}),
      toStatus: row.toStatus,
      actor: {
        type: row.actor.actorType,
        ...(row.actor.actorId ? { userId: oid(row.actor.actorId) } : {}),
      },
      ...(row.reason ? { reason: row.reason } : {}),
    })),
    { session },
  );
};

// ---- Lists -----------------------------------------------------------------------------------

export type RequestFilter = Record<string, unknown>;

export const listRequests = async (
  filter: RequestFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
) => {
  const [items, total] = await Promise.all([
    DonationRequestModel.find(filter)
      .sort(paging.sort)
      .skip(paging.skip)
      .limit(paging.limit)
      .lean<DonationRecord[]>(),
    DonationRequestModel.countDocuments(filter),
  ]);
  return { items, total };
};

export const countRequestsByStatus = (filter: RequestFilter) =>
  DonationRequestModel.aggregate<{ _id: DonationStatus; count: number }>([
    { $match: filter },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

/** Ids of DONATION toys whose title matches (for the admin search). */
export const findDonationToyIdsByTitle = async (pattern: string, limit = 500) =>
  (
    await ToyModel.find({ listingType: 'DONATION', title: { $regex: pattern, $options: 'i' } })
      .select('_id')
      .limit(limit)
      .lean()
  ).map((toy) => toy._id);

export const countCompletedByDonor = (donorId: string) =>
  DonationRequestModel.countDocuments({ donorId: oid(donorId), status: 'COMPLETED' });

export const findHistory = (requestId: Types.ObjectId) =>
  OrderStatusHistoryModel.find({ orderType: 'DONATION', orderId: requestId })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

// ---- Related documents for the DTOs (one query per collection) --------------------------------

const unique = (ids: Array<Types.ObjectId | null | undefined>) => [
  ...new Map(ids.filter(Boolean).map((id) => [String(id), id!])).values(),
];

export const loadRelations = async (records: DonationRecord[], withContacts = false) => {
  const toyIds = unique(records.map((item) => item.toyId));
  const userIds = unique(records.flatMap((item) => [item.donorId, item.requestedBy]));
  const organizationIds = unique(records.map((item) => item.organizationId));
  const [toys, users, organizations] = await Promise.all([
    ToyModel.find({ _id: { $in: toyIds } })
      .select(toySummaryFields)
      .lean(),
    UserModel.find({ _id: { $in: userIds } })
      .select(withContacts ? 'fullName avatarUrl phone email' : 'fullName avatarUrl')
      .lean(),
    OrganizationModel.find({ _id: { $in: organizationIds } })
      .select(withContacts ? 'name status address contactInfo phone logoUrl' : 'name status')
      .lean(),
  ]);
  return {
    toys: new Map(toys.map((toy) => [String(toy._id), toy])),
    users: new Map(users.map((user) => [String(user._id), user])),
    organizations: new Map(organizations.map((org) => [String(org._id), org])),
  };
};

export type Relations = Awaited<ReturnType<typeof loadRelations>>;
