import { isDeepStrictEqual } from 'node:util';

import type { FilterQuery } from 'mongoose';

import {
  adminAuditEntry,
  writeAuditLog,
  type AuditEntry,
} from '../../infrastructure/database/audit.js';
import { withTransaction } from '../../infrastructure/database/schema-types.js';
import type { VisibilityStatus } from '../../shared/domain/statuses.js';
import { assertTransition } from '../../shared/domain/transitions.js';
import { conflict, notFound, type AppError } from '../../shared/errors/app-error.js';
import type { AdminContext } from '../../shared/http/admin-context.js';
import { isDuplicateKeyError } from '../../shared/utils/mongo-errors.js';
import { toMongoPaging } from '../../shared/utils/response.js';
import { accentInsensitivePattern } from '../../shared/utils/text.js';
import { organizationTransitions } from './domain/organization-rules.js';
import {
  toAdminOrganization,
  toAuditView,
  toPublicOrganization,
  type AdminOrganizationDto,
} from './organizations.mapper.js';
import {
  changeStatus,
  countRequests,
  countRequestsByOrganization,
  deleteOrganization,
  findOrganization,
  findOrganizationsPage,
  insertOrganization,
  noRequests,
  updateOrganizationFields,
  type OrganizationRecord,
  type RequestCounts,
} from './organizations.repository.js';
import {
  adminOrganizationSortFields,
  publicOrganizationSortFields,
  type AdminOrganizationListQuery,
  type CreateOrganizationBody,
  type PublicOrganizationListQuery,
  type UpdateOrganizationBody,
} from './organizations.schemas.js';

// Charity organizations (FE-02, UC34): the Admin adds, edits, hides, shows and deletes them;
// Donors see the ACTIVE ones. One that ever received a donation request is kept (GB-36).

const organizationNotFound = () =>
  notFound('ORGANIZATION_NOT_FOUND', 'Không tìm thấy tổ chức từ thiện.');

const nameTaken = () =>
  conflict('ORGANIZATION_NAME_TAKEN', 'Tên tổ chức đã tồn tại.', [
    { field: 'name', message: 'Đã có tổ chức khác dùng tên này.' },
  ]);

// The "name_unique" index (collation vi, strength 2) is the single guard for duplicate names.
const rethrowDuplicateName = (error: unknown): never => {
  throw isDuplicateKeyError(error, 'name_unique') ? nameTaken() : error;
};

const auditEntry = (
  context: AdminContext,
  action: AuditEntry['action'],
  id: string,
  meta: Record<string, unknown>,
): AuditEntry => adminAuditEntry(context, action, { kind: 'ORGANIZATION', id }, meta);

const searchFilter = (q: string | undefined, fields: readonly string[]) => {
  if (!q) return {};
  const pattern = accentInsensitivePattern(q);
  return { $or: fields.map((field) => ({ [field]: { $regex: pattern, $options: 'i' } })) };
};

// ---------- Admin ----------

export const listOrganizationsForAdmin = async (query: AdminOrganizationListQuery) => {
  const filter: FilterQuery<OrganizationRecord> = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.province ? { province: query.province } : {}),
    ...searchFilter(query.q, ['name', 'address', 'contactInfo', 'supportCriteria']),
  };
  const { items, total } = await findOrganizationsPage(
    filter,
    toMongoPaging(query, adminOrganizationSortFields, 'createdAt'),
  );
  const counts = await countRequestsByOrganization(items.map((item) => item._id));
  return {
    items: items.map((item) =>
      toAdminOrganization(item, counts.get(String(item._id)) ?? noRequests, {
        includePhone: false,
      }),
    ),
    total,
  };
};

export const getOrganizationForAdmin = async (id: string): Promise<AdminOrganizationDto> => {
  const record = await findOrganization(id);
  if (!record) throw organizationNotFound();
  return toAdminOrganization(record, await countRequests(record._id), { includePhone: true });
};

// The Admin adds an organization after checking it, so it is ACTIVE at once.
export const createOrganization = async (
  body: CreateOrganizationBody,
  context: AdminContext,
): Promise<AdminOrganizationDto> => {
  try {
    const record = await withTransaction((session) =>
      insertOrganization(
        { ...body, status: 'ACTIVE' },
        (created) =>
          auditEntry(context, 'organization.create', String(created._id), {
            after: toAuditView(created),
          }),
        session,
      ),
    );
    return toAdminOrganization(record, noRequests, { includePhone: true });
  } catch (error) {
    return rethrowDuplicateName(error);
  }
};

const clearableFields = new Set<string>(['description', 'logoUrl']);

const splitUpdate = (body: UpdateOrganizationBody) => {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const [field, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (value === null && clearableFields.has(field)) unset.push(field);
    else set[field] = value;
  }
  return { set, unset };
};

export const updateOrganization = async (
  id: string,
  body: UpdateOrganizationBody,
  context: AdminContext,
): Promise<AdminOrganizationDto> => {
  try {
    const { record, counts } = await withTransaction(async (session) => {
      const before = await findOrganization(id, { session });
      if (!before) throw organizationNotFound();
      const { set, unset } = splitUpdate(body);
      const after = await updateOrganizationFields(before._id, set, unset, session);
      if (!after) throw organizationNotFound();

      const beforeView = toAuditView(before);
      const afterView = toAuditView(after);
      const changed = (Object.keys(afterView) as Array<keyof typeof afterView>).filter(
        (key) => !isDeepStrictEqual(beforeView[key], afterView[key]),
      );
      if (changed.length > 0) {
        await writeAuditLog(
          auditEntry(context, 'organization.update', id, {
            before: Object.fromEntries(changed.map((key) => [key, beforeView[key]])),
            after: Object.fromEntries(changed.map((key) => [key, afterView[key]])),
          }),
          session,
        );
      }
      return { record: after, counts: await countRequests(after._id, session) };
    });
    return toAdminOrganization(record, counts, { includePhone: true });
  } catch (error) {
    return rethrowDuplicateName(error);
  }
};

const alreadyInStatus: Record<VisibilityStatus, () => AppError> = {
  HIDDEN: () => conflict('ORGANIZATION_ALREADY_HIDDEN', 'Tổ chức này đã được ẩn trước đó.'),
  ACTIVE: () => conflict('ORGANIZATION_ALREADY_VISIBLE', 'Tổ chức này đang hiển thị.'),
};

/** ACTIVE <-> HIDDEN: conditional update, audit log and request counts in one transaction. */
const transitionVisibility = (
  id: string,
  to: VisibilityStatus,
  context: AdminContext,
): Promise<{ record: OrganizationRecord; counts: RequestCounts }> =>
  withTransaction(async (session) => {
    const current = await findOrganization(id, { session });
    if (!current) throw organizationNotFound();
    const from = current.status as VisibilityStatus;
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
      auditEntry(context, to === 'HIDDEN' ? 'organization.hide' : 'organization.show', id, {
        before: { status: from },
        after: { status: to },
        openRequestCount: counts.openRequestCount,
      }),
      session,
    );
    return { record: changed, counts };
  });

// Hiding is always allowed: accepted requests continue, PENDING ones can no longer be accepted
// (an Admin rejects or cancels them), and the organization gets no new requests.
export const hideOrganization = async (id: string, context: AdminContext) => {
  const { record, counts } = await transitionVisibility(id, 'HIDDEN', context);
  return {
    organization: toAdminOrganization(record, counts, { includePhone: true }),
    message:
      counts.openRequestCount > 0
        ? `Đã ẩn tổ chức. ${counts.openRequestCount} yêu cầu quyên góp chưa hoàn tất: yêu cầu đã chấp nhận vẫn tiếp tục, yêu cầu đang chờ không thể được chấp nhận nữa và cần được từ chối hoặc hủy; tổ chức không nhận yêu cầu mới.`
        : 'Đã ẩn tổ chức. Người tặng sẽ không thấy tổ chức này nữa.',
  };
};

export const showOrganization = async (id: string, context: AdminContext) => {
  const { record, counts } = await transitionVisibility(id, 'ACTIVE', context);
  return {
    organization: toAdminOrganization(record, counts, { includePhone: true }),
    message: 'Đã hiện lại tổ chức. Người tặng có thể chọn tổ chức này.',
  };
};

// Only an organization that never received a donation request can be deleted. With running
// requests it can only be hidden; with past requests the history is kept (GB-36).
// Race: the donations feature touches the organization document (conditional update on status
// ACTIVE) inside its create transaction, so that create and this delete write-conflict.
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
      auditEntry(context, 'organization.delete', id, { before: toAuditView(record) }),
      session,
    );
  });
};

// ---------- Donors (public) ----------

export const listPublicOrganizations = async (
  query: PublicOrganizationListQuery,
  options: { includePhone: boolean },
) => {
  const filter: FilterQuery<OrganizationRecord> = {
    status: 'ACTIVE',
    ...(query.province ? { province: query.province } : {}),
    ...(query.ageGroup ? { ageGroups: query.ageGroup } : {}),
    ...searchFilter(query.q, ['name', 'address', 'supportCriteria']),
  };
  const { items, total } = await findOrganizationsPage(
    filter,
    toMongoPaging(query, publicOrganizationSortFields, 'name'),
  );
  return { items: items.map((item) => toPublicOrganization(item, options)), total };
};

export const getPublicOrganization = async (id: string, options: { includePhone: boolean }) => {
  const record = await findOrganization(id, { status: 'ACTIVE' });
  if (!record) throw organizationNotFound();
  return toPublicOrganization(record, options);
};
