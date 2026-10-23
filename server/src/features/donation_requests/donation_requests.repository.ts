import { randomBytes } from 'node:crypto';

import mongoose, { Types, type ClientSession } from 'mongoose';

import { isDuplicateKeyError } from '../../shared/utils/mongo-errors.js';
import { Organization } from '../organizations/organizations.model.js';
import { Toy } from '../toys/toys.model.js';
import { User } from '../users/users.model.js';
import {
  DonationRequest,
  type IDonationRequest,
  type StoredDonationStatus,
} from './donation_requests.model.js';
import type { ToyStatus } from './donation_requests.policy.js';
import { DELIVERY_METHOD } from './donation_requests.statuses.js';

// The only file of this feature that touches models (features/README.md rule 6). It also
// reads and writes develop's toy, organization and user models the donation flow depends on.

export type DonationRecord = IDonationRequest;

const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id);

const toySummaryFields = 'ownerId title images condition ageRange listingType status';

/** The lean toy fields the donation flow reads. */
export interface ToySummary {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string;
  images: Array<{ url: string; publicId: string }>;
  condition: string;
  ageRange?: { minAge: number; maxAge: number };
  listingType: string;
  status: string;
}

/** Runs `work` in a MongoDB transaction (retried by the driver on transient errors). */
export const withTransaction = <T>(work: (session: ClientSession) => Promise<T>): Promise<T> =>
  mongoose.connection.transaction(work);

// ---- Single documents ----------------------------------------------------------------------

export const findRequestById = (id: string, session?: ClientSession) =>
  DonationRequest.findById(id)
    .session(session ?? null)
    .lean<DonationRecord>();

export const findToy = (toyId: string | Types.ObjectId, session?: ClientSession) =>
  Toy.findById(toyId)
    .select(toySummaryFields)
    .session(session ?? null)
    .lean<ToySummary>();

export const findOrganization = (id: string | Types.ObjectId, session?: ClientSession) =>
  Organization.findById(id)
    .select('name status')
    .session(session ?? null)
    .lean();

/** The user's account status ('ACTIVE' / 'LOCKED'), undefined when missing. */
export const findUserStatus = async (userId: string | Types.ObjectId, session?: ClientSession) =>
  (
    await User.findById(userId)
      .select('status')
      .session(session ?? null)
      .lean()
  )?.status;

/** An accepted or shipping request holds the toy (GB-12). */
export const hasActiveRequestForToy = async (toyId: string): Promise<boolean> =>
  Types.ObjectId.isValid(toyId) &&
  (await DonationRequest.exists({
    toyId: oid(toyId),
    status: { $in: ['accepted', 'shipping'] },
  })) !== null;

/** Ids of requests in `status` whose timer.dueAt is before `now` (expiry job). */
export const findDueRequestIds = async (status: StoredDonationStatus, now: Date, limit: number) =>
  (
    await DonationRequest.find({ status, 'timer.dueAt': { $lt: now } })
      .select('_id')
      .sort({ 'timer.dueAt': 1 })
      .limit(limit)
      .lean()
  ).map((item) => item._id);

/** Ids of the pending requests of a toy. */
export const findPendingRequestIdsOfToy = async (toyId: string) =>
  (
    await DonationRequest.find({ toyId: oid(toyId), status: 'pending' })
      .select('_id')
      .lean()
  ).map((item) => item._id);

export const userExists = async (userId: string): Promise<boolean> =>
  (await User.exists({ _id: oid(userId) })) !== null;

// ---- Writes (always inside the caller's transaction) -----------------------------------------

// The "touch" writes below bump __v (timestamps untouched) only while the document is still in
// the expected state, so a create write-conflicts with a concurrent accept of the toy or a
// concurrent hide of the organization, and the transaction is retried with fresh data.

/** The donation toy, if it is still active (else null). */
export const touchActiveDonationToy = (toyId: string | Types.ObjectId, session: ClientSession) =>
  Toy.findOneAndUpdate(
    { _id: oid(toyId), status: 'active', listingType: 'donate' },
    { $inc: { __v: 1 } },
    { new: true, session, timestamps: false, projection: toySummaryFields },
  ).lean<ToySummary>();

/** The organization, if it is still active (else null). */
export const touchActiveOrganization = (id: string | Types.ObjectId, session: ClientSession) =>
  Organization.findOneAndUpdate(
    { _id: oid(id), status: { $regex: /^active$/i } },
    { $inc: { __v: 1 } },
    { new: true, session, timestamps: false, projection: 'name status' },
  ).lean();

const newCode = (): string => `DN${randomBytes(5).toString('hex').toUpperCase()}`;
const CODE_ATTEMPTS = 3;

/** Inserts a pending request with a fresh code (retried on the rare code clash). */
export const insertRequest = async (
  data: {
    toyId: Types.ObjectId;
    donorId: Types.ObjectId;
    requestedBy: string;
    organizationId?: string;
    itemDetails: string;
    dueAt: Date;
  },
  session: ClientSession,
): Promise<DonationRecord> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const [created] = await DonationRequest.create(
        [
          {
            code: newCode(),
            toyId: data.toyId,
            donorId: data.donorId,
            requestedBy: oid(data.requestedBy),
            receiver: data.organizationId
              ? { organizationId: oid(data.organizationId) }
              : { userId: oid(data.requestedBy) },
            itemDetails: data.itemDetails,
            deliveryMethod: DELIVERY_METHOD,
            status: 'pending',
            timer: { dueAt: data.dueAt },
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
  from: StoredDonationStatus,
  to: StoredDonationStatus,
  changes: {
    set?: Record<string, unknown>;
    unset?: string[];
    pushHandover?: Record<string, unknown>;
  },
  session: ClientSession,
) =>
  DonationRequest.findOneAndUpdate(
    { _id: id, status: from },
    {
      $set: { ...changes.set, status: to },
      ...(changes.unset?.length
        ? { $unset: Object.fromEntries(changes.unset.map((path) => [path, 1])) }
        : {}),
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
  const result = await Toy.updateOne(
    { _id: toyId, status: from },
    { $set: { status: to } },
    { session },
  );
  return result.modifiedCount === 1;
};

/** Rejects every other pending request of the toy; returns the rejected requests. */
export const rejectPendingSiblings = async (
  toyId: Types.ObjectId,
  acceptedId: Types.ObjectId,
  decision: { decidedBy: Types.ObjectId; decidedAt: Date; rejectReason: string },
  session: ClientSession,
): Promise<DonationRecord[]> => {
  const siblings = await DonationRequest.find({
    toyId,
    status: 'pending',
    _id: { $ne: acceptedId },
  })
    .session(session)
    .lean<DonationRecord[]>();
  if (siblings.length === 0) return [];
  await DonationRequest.updateMany(
    { _id: { $in: siblings.map((item) => item._id) }, status: 'pending' },
    { $set: { ...decision, status: 'rejected' }, $unset: { timer: 1 } },
    { session },
  );
  return siblings.map((sibling) => ({ ...sibling, ...decision, status: 'rejected' as const }));
};

// ---- Lists -----------------------------------------------------------------------------------

export type RequestFilter = Record<string, unknown>;

export const listRequests = async (
  filter: RequestFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
) => {
  const [items, total] = await Promise.all([
    DonationRequest.find(filter)
      .sort(paging.sort)
      .skip(paging.skip)
      .limit(paging.limit)
      .lean<DonationRecord[]>(),
    DonationRequest.countDocuments(filter),
  ]);
  return { items, total };
};

export const countRequestsByStatus = (filter: RequestFilter) =>
  DonationRequest.aggregate<{ _id: StoredDonationStatus; count: number }>([
    { $match: filter },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

/** Ids of donation toys whose title matches (for the admin search). */
export const findDonationToyIdsByTitle = async (pattern: string, limit = 500) =>
  (
    await Toy.find({ listingType: 'donate', title: { $regex: pattern, $options: 'i' } })
      .select('_id')
      .limit(limit)
      .lean()
  ).map((toy) => toy._id);

export const countCompletedByDonor = (donorId: string) =>
  DonationRequest.countDocuments({ donorId: oid(donorId), status: 'completed' });

// ---- Related documents for the DTOs (one query per collection) --------------------------------

const unique = (ids: Array<Types.ObjectId | null | undefined>) => [
  ...new Map(
    ids.filter((id): id is Types.ObjectId => Boolean(id)).map((id) => [String(id), id]),
  ).values(),
];

export const loadRelations = async (records: DonationRecord[], withContacts = false) => {
  const toyIds = unique(records.map((item) => item.toyId));
  const userIds = unique(records.flatMap((item) => [item.donorId, item.requestedBy]));
  const organizationIds = unique(records.map((item) => item.receiver?.organizationId));
  const [toys, users, organizations] = await Promise.all([
    Toy.find({ _id: { $in: toyIds } })
      .select(toySummaryFields)
      .lean<ToySummary[]>(),
    User.find({ _id: { $in: userIds } })
      // phone: also the D-03 counterpart contact of user views (the mapper decides who sees it).
      .select(withContacts ? 'fullName avatar phone email' : 'fullName avatar phone')
      .lean(),
    Organization.find({ _id: { $in: organizationIds } })
      .select(
        withContacts
          ? 'name status address contact_info support_criteria'
          : 'name status contact_info',
      )
      .lean(),
  ]);
  return {
    toys: new Map(toys.map((toy) => [String(toy._id), toy])),
    users: new Map(users.map((user) => [String(user._id), user])),
    organizations: new Map(organizations.map((org) => [String(org._id), org])),
  };
};

export type Relations = Awaited<ReturnType<typeof loadRelations>>;
