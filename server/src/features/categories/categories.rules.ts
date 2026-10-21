import type { AuditAction } from '../../infrastructure/database/audit.js';
import { type AppError } from '../../shared/errors/app-error.js';
import { conflict, notFound } from '../../shared/errors/http-errors.js';
import type { TransitionMap } from '../../shared/utils/transitions.js';
import type { CategoryStatus } from './categories.schemas.js';

// Errors and the active <-> hidden state machine of a category.

/** active <-> hidden. */
export const visibilityTransitions: TransitionMap<CategoryStatus> = {
  active: ['hidden'],
  hidden: ['active'],
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

/** What hide (to hidden) and show (to active) do. */
export const visibilityChanges = {
  hidden: {
    from: 'active',
    action: 'category.hide',
    message: 'Đã ẩn danh mục.',
    alreadyThere: () => conflict('CATEGORY_ALREADY_HIDDEN', 'Danh mục này đã được ẩn từ trước.'),
  },
  active: {
    from: 'hidden',
    action: 'category.show',
    message: 'Đã hiện lại danh mục.',
    alreadyThere: () => conflict('CATEGORY_ALREADY_VISIBLE', 'Danh mục này đang được hiển thị.'),
  },
} as const satisfies Record<
  CategoryStatus,
  { from: CategoryStatus; action: AuditAction; message: string; alreadyThere: () => AppError }
>;
