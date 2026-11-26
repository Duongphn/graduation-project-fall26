import mongoose from 'mongoose';
import {
  rentalOrderStatuses,
  type RentalOrderStatus,
} from '../constants/rental-order-status.js';
import { parseDateOnly } from '../services/rental-time.js';
import { AppError } from '../utils/app-error.js';

export interface RentalPeriodInput {
  toyId: string;
  startDate: string;
  endDate: string;
}

export function validateRentalPeriodInput(body: unknown): RentalPeriodInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }

  const { toyId, startDate, endDate } = body as Record<string, unknown>;

  if (typeof toyId !== 'string' || !mongoose.Types.ObjectId.isValid(toyId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'toyId không hợp lệ.');
  }

  if (typeof startDate !== 'string' || !parseDateOnly(startDate)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'startDate không đúng định dạng YYYY-MM-DD.');
  }

  if (typeof endDate !== 'string' || !parseDateOnly(endDate)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'endDate không đúng định dạng YYYY-MM-DD.');
  }

  return {
    toyId,
    startDate,
    endDate,
  };
}

export function validateRejectRentalInput(body: unknown): { reason: string } {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }

  const { reason } = body as Record<string, unknown>;
  if (typeof reason !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Lý do từ chối phải là chuỗi ký tự.');
  }

  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Lý do từ chối phải từ 5 đến 500 ký tự.');
  }

  return { reason: trimmed };
}

export function validateCancelRentalInput(body: unknown): { reason: string } {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }

  const { reason } = body as Record<string, unknown>;
  if (typeof reason !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Lý do hủy phải là chuỗi ký tự.');
  }

  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Lý do hủy phải từ 5 đến 500 ký tự.');
  }

  return { reason: trimmed };
}

export interface RentalListQuery {
  role: 'renter' | 'owner';
  status?: RentalOrderStatus | undefined;
  page: number;
  limit: number;
}

export function validateRentalListQuery(query: unknown): RentalListQuery {
  if (typeof query !== 'object' || query === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Query không hợp lệ.');
  }

  const q = query as Record<string, unknown>;

  if (q.role !== 'renter' && q.role !== 'owner') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'role là bắt buộc và phải là "renter" hoặc "owner".',
    );
  }

  let status: RentalOrderStatus | undefined;
  if (q.status !== undefined && q.status !== '') {
    if (typeof q.status !== 'string' || !rentalOrderStatuses.includes(q.status as RentalOrderStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Trạng thái đơn thuê không hợp lệ.');
    }
    status = q.status as RentalOrderStatus;
  }

  let page = 1;
  let limit = 20;

  if (q.page !== undefined && q.page !== '') {
    const p = Number(q.page);
    if (!Number.isInteger(p) || p < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Trang phải là số nguyên >= 1.');
    }
    page = p;
  }

  if (q.limit !== undefined && q.limit !== '') {
    const l = Number(q.limit);
    if (!Number.isInteger(l) || l < 1 || l > 100) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Số lượng mỗi trang phải từ 1 đến 100.');
    }
    limit = l;
  }

  return {
    role: q.role,
    status,
    page,
    limit,
  };
}

export interface SettleRentalInput {
  result: 'GOOD' | 'DAMAGED';
  description?: string | undefined;
}

export function validateSettleRentalInput(body: unknown): SettleRentalInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }

  const { result, description } = body as Record<string, unknown>;

  if (result !== 'GOOD' && result !== 'DAMAGED') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Kết quả quyết toán phải là "GOOD" hoặc "DAMAGED".',
    );
  }

  if (result === 'GOOD') {
    return { result };
  }

  // Kiểm tra ở đây (trước khi service upload ảnh bằng chứng) để dữ liệu sai không để lại ảnh rác
  const trimmed = typeof description === 'string' ? description.trim() : '';
  if (trimmed.length < 10 || trimmed.length > 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Mô tả hư hại phải có độ dài từ 10 đến 1000 ký tự.');
  }

  return { result, description: trimmed };
}

export function validateReturnRentalInput(body: unknown): { note?: string | undefined } {
  const note = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).note : undefined;
  if (note === undefined || note === null || note === '') {
    return {};
  }
  if (typeof note !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ghi chú phải là chuỗi ký tự.');
  }

  const trimmed = note.trim();
  if (trimmed.length > 500) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ghi chú không được vượt quá 500 ký tự.');
  }

  return trimmed ? { note: trimmed } : {};
}
