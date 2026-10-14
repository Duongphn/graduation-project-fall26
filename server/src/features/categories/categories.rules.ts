import type { VisibilityStatus } from '../../shared/domain/statuses.js';
import type { AuditAction } from '../../infrastructure/database/audit.js';
import { conflict, notFound, type AppError } from '../../shared/errors/app-error.js';

// Errors and the ACTIVE <-> HIDDEN state machine of a category.

/** ACTIVE <-> HIDDEN. Proposed for shared/domain/transitions.ts (organizations use it too). */
export const visibilityTransitions: Readonly<
  Record<VisibilityStatus, readonly VisibilityStatus[]>
> = {
  ACTIVE: ['HIDDEN'],
  HIDDEN: ['ACTIVE'],
};

const NAME_TAKEN_MESSAGE = 'Tên danh mục đã tồn tại.';

export const categoryNotFound = () => notFound('CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');

export const categoryNameTaken = () =>
  conflict('CATEGORY_NAME_TAKEN', NAME_TAKEN_MESSAGE, [
    { field: 'name', message: NAME_TAKEN_MESSAGE },
  ]);

export const categoryInUse = (toyCount: number) =>
  conflict(
    'CATEGORY_IN_USE',
    `Danh mục đang có ${toyCount} đồ chơi nên không thể xoá. Hãy ẩn danh mục thay vì xoá.`,
    { toyCount },
  );

/** Another Admin changed the status between the read and the conditional write. */
export const categoryStatusChanged = () =>
  conflict(
    'CATEGORY_STATUS_CHANGED',
    'Trạng thái danh mục vừa được thay đổi. Vui lòng tải lại và thử lại.',
  );

/** What hide (to HIDDEN) and show (to ACTIVE) do. */
export const visibilityChanges = {
  HIDDEN: {
    from: 'ACTIVE',
    action: 'category.hide',
    message: 'Đã ẩn danh mục.',
    alreadyThere: () => conflict('CATEGORY_ALREADY_HIDDEN', 'Danh mục này đã được ẩn từ trước.'),
  },
  ACTIVE: {
    from: 'HIDDEN',
    action: 'category.show',
    message: 'Đã hiện lại danh mục.',
    alreadyThere: () => conflict('CATEGORY_ALREADY_VISIBLE', 'Danh mục này đang được hiển thị.'),
  },
} as const satisfies Record<
  VisibilityStatus,
  { from: VisibilityStatus; action: AuditAction; message: string; alreadyThere: () => AppError }
>;
