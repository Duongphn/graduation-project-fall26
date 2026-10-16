export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Shorthands for the usual errors, e.g. `throw notFound('TOY_NOT_FOUND', 'Không tìm thấy…')`. */
export const badRequest = (code: string, message: string, details?: unknown): AppError =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Bạn cần đăng nhập để thực hiện thao tác này.'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (code: string, message: string): AppError =>
  new AppError(404, code, message);

export const conflict = (code: string, message: string, details?: unknown): AppError =>
  new AppError(409, code, message, details);

export const unprocessable = (code: string, message: string, details?: unknown): AppError =>
  new AppError(422, code, message, details);
