import type { ErrorRequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.js';
import { duplicateKeyFields } from '../utils/mongo-errors.js';
import { toValidationDetails } from './validate.js';

const send = (
  response: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void => {
  response.status(status).json({
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
};

// Error envelope: { success: false, error: { code, message, details? } } (api-conventions.md §2).
// Stack traces and database internals never reach the client.
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;

  if (error instanceof AppError) {
    send(response, error.statusCode, error.code, error.message, error.details);
    return;
  }
  if (error instanceof ZodError) {
    send(
      response,
      400,
      'VALIDATION_ERROR',
      'Dữ liệu yêu cầu không hợp lệ.',
      toValidationDetails(error),
    );
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    send(response, 422, 'VALIDATION_ERROR', 'Dữ liệu không thỏa quy tắc nghiệp vụ.', details);
    return;
  }
  if (error instanceof mongoose.Error.CastError) {
    send(response, 400, 'INVALID_ID', `Giá trị không hợp lệ cho trường ${error.path}.`);
    return;
  }

  const code = (error as { code?: unknown }).code;
  if (code === 11000) {
    const fields = duplicateKeyFields(error);
    send(response, 409, 'DUPLICATE', 'Dữ liệu đã tồn tại.', fields.length ? { fields } : undefined);
    return;
  }
  // MongoDB DocumentValidationFailure: a database-side rule (e.g. a balance below zero).
  if (code === 121) {
    send(response, 422, 'BUSINESS_RULE_VIOLATION', 'Dữ liệu vi phạm quy tắc của hệ thống.');
    return;
  }
  const httpError = error as { type?: unknown; status?: unknown; expose?: unknown };
  if (httpError.type === 'entity.parse.failed') {
    send(response, 400, 'INVALID_JSON', 'Nội dung JSON không hợp lệ.');
    return;
  }
  if (httpError.type === 'entity.too.large') {
    send(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu quá lớn.');
    return;
  }
  // Other client errors raised by Express middleware (http-errors with expose = true).
  if (
    typeof httpError.status === 'number' &&
    httpError.status >= 400 &&
    httpError.status < 500 &&
    httpError.expose === true
  ) {
    send(response, httpError.status, 'BAD_REQUEST', 'Yêu cầu không hợp lệ.');
    return;
  }

  console.error('Unhandled error', error);
  send(response, 500, 'INTERNAL_SERVER_ERROR', 'Đã có lỗi bất ngờ xảy ra từ phía máy chủ.');
};
