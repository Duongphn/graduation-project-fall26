import { isDeepStrictEqual } from 'node:util';

import { Types, type ClientSession, type FilterQuery } from 'mongoose';

import {
  adminAuditEntry,
  writeAuditLog,
  type AuditEntry,
} from '../repositories/audit-log.repository.js';
import { type AppError } from '../utils/app-error.js';
import { conflict, notFound, unprocessable } from '../utils/http-errors.js';
import type { AdminContext } from '../utils/admin-context.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';
import { toMongoPaging } from '../utils/response.js';
import { accentInsensitivePattern } from '../utils/text.js';
import { assertTransition } from '../utils/transitions.js';
import {
  ageRangesOverlap,
  organizationTransitions,
  type AgeRange,
  type OrganizationStatus,
} from '../constants/organization-rules.js';
import {
  toAdminOrganization,
  toPublicOrganization,
  type AdminOrganizationDto,
} from './organization.mapper.js';
import {
  changeStatus,
  countRequests,
  countRequestsByOrganization,
  deleteOrganization,
  findActiveCategoryIds,
  findOrganization,
  findOrganizationWithSameName,
  findOrganizationsPage,
  findSuggestedOrganizations,
  insertOrganization,
  noRequests,
  updateOrganizationFields,
  withTransaction,
  type OrganizationRecord,
  type RequestCounts,
} from '../repositories/organization.repository.js';
import {
  adminOrganizationSortFields,
  publicOrganizationSortFields,
  type AdminOrganizationListQuery,
  type CreateOrganizationBody,
  type OrganizationSuggestionQuery,
  type PublicOrganizationListQuery,
  type UpdateOrganizationBody,
} from '../validations/organization.validation.js';

// Charity organizations (FE-02, UC34, UC40): the Admin adds, edits, hides, shows and deletes
// them and keeps their receiving point and needs profile; Donors see the ACTIVE ones that are
// accepting toys. One that ever received a donation request is kept (GB-36).

const organizationNotFound = () =>
  notFound('ORGANIZATION_NOT_FOUND', 'Không tìm thấy tổ chức từ thiện.');

const nameTaken = () =>
  conflict('ORGANIZATION_NAME_TAKEN', 'Tên tổ chức đã tồn tại.', [
    { field: 'name', message: 'Đã có tổ chức khác dùng tên này.' },
  ]);

// The name is unique ignoring letter case and accents: the service checks that inside the write
// transaction, and the "name_unique" index still guards exact duplicates written concurrently.
const rethrowDuplicateName = (error: unknown): never => {
  throw isDuplicateKeyError(error, 'name_unique') ? nameTaken() : error;
};

const assertNameFree = async (
  name: string | undefined,
  exceptId: Types.ObjectId | string | undefined,
  session: ClientSession,
) => {
  if (name !== undefined && (await findOrganizationWithSameName(name, exceptId, session))) {
    throw nameTaken();
  }
};

const auditEntry = (
  context: AdminContext,
  action: AuditEntry['action'],
  id: string,
  details?: AuditEntry['details'],
): AuditEntry => adminAuditEntry(context, action, { kind: 'ORGANIZATION', id }, details);

/** API body (camelCase) -> develop's stored fields. */
const toStored = (body: UpdateOrganizationBody): Record<string, unknown> => {
  const stored: Record<string, unknown> = {};
  if (body.name !== undefined) stored.name = body.name;
  if (body.address !== undefined) stored.address = body.address;
  if (body.contactInfo !== undefined) stored.contact_info = body.contactInfo;
  if (body.supportCriteria !== undefined) stored.support_criteria = body.supportCriteria;
  if (body.verificationNote !== undefined) stored.verificationNote = body.verificationNote;
  if (body.receivingPoint !== undefined) stored.receivingPoint = body.receivingPoint;
  if (body.ageGroups !== undefined) stored.ageGroups = body.ageGroups;
  if (body.categoryIds !== undefined) {
    stored.categoryIds = body.categoryIds.map((id) => new Types.ObjectId(id));
  }
  if (body.areaProvince !== undefined) stored.areaProvince = body.areaProvince;
  if (body.isRemoteArea !== undefined) stored.isRemoteArea = body.isRemoteArea;
  if (body.isAccepting !== undefined) stored.isAccepting = body.isAccepting;
  return stored;
};

/** GB-53: the needs name Active categories only (422 CATEGORY_NOT_FOUND, field categoryIds). */
const assertActiveCategories = async (categoryIds: string[] | undefined) => {
  if (!categoryIds?.length) return;
  const active = await findActiveCategoryIds(categoryIds.map((id) => new Types.ObjectId(id)));
  const missing = categoryIds.filter((id) => !active.has(id.toLowerCase()));
  if (missing.length > 0) {
    throw unprocessable('CATEGORY_NOT_FOUND', 'Danh mục không tồn tại hoặc đang bị ẩn.', [
      { field: 'categoryIds', message: `Danh mục không hợp lệ: ${missing.join(', ')}.` },
    ]);
  }
};

/**
 * GB-51/GB-55: what Donors may see and send requests to: active, accepting toys (a missing
 * isAccepting = accepting) and with a receiving point (an organization saved before receiving
 * points existed has none until the Admin enters it).
 */
export const visibleToDonors = {
  status: 'active',
  isAccepting: { $ne: false },
  receivingPoint: { $type: 'object' },
} as const;

/**
 * A toy age range [minAge, maxAge) overlaps one of the accepted age groups (GB-54). A one-age
 * toy (minAge === maxAge) counts as [minAge, minAge + 1), as in ageRangesOverlap.
 */
const ageGroupFilter = (range: AgeRange) => ({
  ageGroups: {
    $elemMatch: {
      minAge: { $lt: Math.max(range.maxAge, range.minAge + 1) },
      maxAge: { $gt: range.minAge },
    },
  },
});

const provinceFilter = (province: string | undefined) =>
  province
    ? {
        'receivingPoint.province': {
          $regex: `^${accentInsensitivePattern(province)}$`,
          $options: 'i',
        },
      }
    : {};

const searchFilter = (q: string | undefined, fields: readonly string[]) => {
  if (!q) return {};
  const pattern = accentInsensitivePattern(q);
  return { $or: fields.map((field) => ({ [field]: { $regex: pattern, $options: 'i' } })) };
};

// ---------- Admin ----------

export const listOrganizationsForAdmin = async (query: AdminOrganizationListQuery) => {
  const filter: FilterQuery<OrganizationRecord> = {
    ...(query.status ? { status: query.status } : {}),
    ...searchFilter(query.q, [
      'name',
      'address',
      'contact_info',
      'support_criteria',
      'receivingPoint.province',
    ]),
  };
  const { items, total } = await findOrganizationsPage(
    filter,
    toMongoPaging(query, adminOrganizationSortFields, 'createdAt'),
  );
  const counts = await countRequestsByOrganization(items.map((item) => item._id));
  return {
    items: items.map((item) =>
      toAdminOrganization(item, counts.get(String(item._id)) ?? noRequests),
    ),
    total,
  };
};

export const getOrganizationForAdmin = async (id: string): Promise<AdminOrganizationDto> => {
  const record = await findOrganization(id);
  if (!record) throw organizationNotFound();
  return toAdminOrganization(record, await countRequests(record._id));
};

// The Admin adds an organization after checking it, so it is active at once.
export const createOrganization = async (
  body: CreateOrganizationBody,
  context: AdminContext,
): Promise<AdminOrganizationDto> => {
  await assertActiveCategories(body.categoryIds);
  try {
    const record = await withTransaction(async (session) => {
      await assertNameFree(body.name, undefined, session);
      return insertOrganization(
        {
          ...toStored(body),
          areaProvince: body.areaProvince ?? body.receivingPoint.province,
          isRemoteArea: body.isRemoteArea ?? false,
          isAccepting: body.isAccepting ?? true,
          status: 'active',
          // UC34: the Admin has just checked it.
          verifiedAt: new Date(),
        },
        (created) =>
          auditEntry(context, 'organization.create', String(created._id), { name: created.name }),
        session,
      );
    });
    return toAdminOrganization(record, noRequests);
  } catch (error) {
    return rethrowDuplicateName(error);
  }
};

export const updateOrganization = async (
  id: string,
  body: UpdateOrganizationBody,
  context: AdminContext,
): Promise<AdminOrganizationDto> => {
  await assertActiveCategories(body.categoryIds);
  try {
    const { record, counts } = await withTransaction(async (session) => {
      const before = await findOrganization(id, { session });
      if (!before) throw organizationNotFound();
      await assertNameFree(body.name, before._id, session);
      const set = toStored(body);
      // UC34: an organization added before the check was recorded gets its date with its note.
      if (body.verificationNote !== undefined && !before.verifiedAt) set.verifiedAt = new Date();
      const after = await updateOrganizationFields(before._id, set, [], session);
      if (!after) throw organizationNotFound();

      const changed = Object.keys(set).some(
        (key) =>
          !isDeepStrictEqual(
            (before as unknown as Record<string, unknown>)[key],
            (after as unknown as Record<string, unknown>)[key],
          ),
      );
      if (changed) {
        await writeAuditLog(auditEntry(context, 'organization.update', id), session);
      }
      return { record: after, counts: await countRequests(after._id, session) };
    });
    return toAdminOrganization(record, counts);
  } catch (error) {
    return rethrowDuplicateName(error);
  }
};

const alreadyInStatus: Record<OrganizationStatus, () => AppError> = {
  hidden: () => conflict('ORGANIZATION_ALREADY_HIDDEN', 'Tổ chức này đã được ẩn trước đó.'),
  active: () => conflict('ORGANIZATION_ALREADY_VISIBLE', 'Tổ chức này đang hiển thị.'),
};

/** active <-> hidden: conditional update, audit log and request counts in one transaction. */
const transitionVisibility = (
  id: string,
  to: OrganizationStatus,
  context: AdminContext,
): Promise<{ record: OrganizationRecord; counts: RequestCounts }> =>
  withTransaction(async (session) => {
    const current = await findOrganization(id, { session });
    if (!current) throw organizationNotFound();
    const from = current.status as OrganizationStatus;
    if (from === to) throw alreadyInStatus[to]();
    assertTransition(organizationTransitions, from, to);

    const changed = await changeStatus(current._id, from, to, session);
    if (!changed) {
      throw conflict(
        'ORGANIZATION_STATUS_CHANGED',
        'Trạng thái tổ chức vừa được thay đổi. Vui lòng tải lại và thử lại.',
      );
    }
    const counts = await countRequests(current._id, session);
    await writeAuditLog(
      auditEntry(context, to === 'hidden' ? 'organization.hide' : 'organization.show', id),
      session,
    );
    return { record: changed, counts };
  });

// Hiding is always allowed: accepted requests continue, PENDING ones can no longer be accepted
// (an Admin rejects or cancels them), and the organization gets no new requests.
export const hideOrganization = async (id: string, context: AdminContext) => {
  const { record, counts } = await transitionVisibility(id, 'hidden', context);
  return {
    organization: toAdminOrganization(record, counts),
    message:
      counts.openRequestCount > 0
        ? `Đã ẩn tổ chức. ${counts.openRequestCount} yêu cầu quyên góp chưa hoàn tất: yêu cầu đã chấp nhận vẫn tiếp tục, yêu cầu đang chờ không thể được chấp nhận nữa và cần được từ chối hoặc hủy; tổ chức không nhận yêu cầu mới.`
        : 'Đã ẩn tổ chức. Người tặng sẽ không thấy tổ chức này nữa.',
  };
};

export const showOrganization = async (id: string, context: AdminContext) => {
  const { record, counts } = await transitionVisibility(id, 'active', context);
  return {
    organization: toAdminOrganization(record, counts),
    message: 'Đã hiện lại tổ chức. Người tặng có thể chọn tổ chức này.',
  };
};

// Only an organization that never received a donation request can be deleted. With running
// requests it can only be hidden; with past requests the history is kept (GB-36).
export const deleteOrganizationById = async (id: string, context: AdminContext): Promise<void> => {
  await withTransaction(async (session) => {
    const record = await findOrganization(id, { session });
    if (!record) throw organizationNotFound();
    const counts = await countRequests(record._id, session);
    if (counts.openRequestCount > 0) {
      throw conflict(
        'ORGANIZATION_HAS_OPEN_REQUESTS',
        `Tổ chức đang có ${counts.openRequestCount} yêu cầu quyên góp chưa hoàn tất nên không thể xoá, chỉ có thể ẩn.`,
        counts,
      );
    }
    if (counts.requestCount > 0) {
      throw conflict(
        'ORGANIZATION_IN_USE',
        `Tổ chức đã có ${counts.requestCount} yêu cầu quyên góp trong lịch sử nên phải được giữ lại; hãy ẩn tổ chức thay vì xoá.`,
        counts,
      );
    }
    if (!(await deleteOrganization(record._id, session))) throw organizationNotFound();
    await writeAuditLog(
      auditEntry(context, 'organization.delete', id, { name: record.name }),
      session,
    );
  });
};

// ---------- Donors (public) ----------

/** GB-52: Active organizations that are accepting toys, with the Donor's filters. */
export const listPublicOrganizations = async (query: PublicOrganizationListQuery) => {
  const filter: FilterQuery<OrganizationRecord> = {
    ...visibleToDonors,
    ...searchFilter(query.q, ['name', 'address', 'support_criteria']),
    ...provinceFilter(query.province),
    ...(query.minAge !== undefined || query.maxAge !== undefined
      ? ageGroupFilter({
          minAge: query.minAge ?? 0,
          maxAge: query.maxAge ?? query.minAge ?? 0,
        })
      : {}),
    ...(query.categoryId ? { categoryIds: new Types.ObjectId(query.categoryId) } : {}),
    ...(query.remoteOnly ? { isRemoteArea: true } : {}),
  };
  const { items, total } = await findOrganizationsPage(
    filter,
    toMongoPaging(query, publicOrganizationSortFields, 'name'),
  );
  return { items: items.map((item) => toPublicOrganization(item)), total };
};

export const getPublicOrganization = async (id: string) => {
  const record = await findOrganization(id, { status: 'active' });
  if (!record) throw organizationNotFound();
  return toPublicOrganization(record);
};

/**
 * GB-54, rules only (no AI, LI-03): the Active organizations accepting toys whose age groups
 * overlap the toy's age range and whose categories include the toy's category. Those whose
 * receiving point is in the Donor's province come first, then by name.
 */
export const suggestOrganizations = async (query: OrganizationSuggestionQuery) => {
  const toyRange = { minAge: query.minAge, maxAge: query.maxAge };
  const records = await findSuggestedOrganizations(
    {
      ...visibleToDonors,
      ...ageGroupFilter(toyRange),
      categoryIds: new Types.ObjectId(query.categoryId),
    },
    query.province ? accentInsensitivePattern(query.province) : undefined,
  );
  return records
    .filter((record) => (record.ageGroups ?? []).some((group) => ageRangesOverlap(toyRange, group)))
    .map((record) => toPublicOrganization(record));
};
