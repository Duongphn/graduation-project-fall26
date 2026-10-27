import { AppError } from './app-error.js';

// Shorthands for the usual errors, built on develop's AppError and its error codes
// (UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, ...). Responses go through the shared errorHandler.

export const badRequest = (code: string, message: string, details?: unknown): AppError =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Authentication required.'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (code: string, message: string): AppError =>
  new AppError(404, code, message);

export const conflict = (code: string, message: string, details?: unknown): AppError =>
  new AppError(409, code, message, details);

export const unprocessable = (code: string, message: string, details?: unknown): AppError =>
  new AppError(422, code, message, details);
