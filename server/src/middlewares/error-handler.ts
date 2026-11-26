import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../utils/app-error.js';

const GENERIC_SERVER_ERROR_MESSAGE = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

// Lỗi HTTP do thư viện ném ra (body-parser, raw-body, http-errors) có status/expose.
type HttpLikeError = {
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  expose?: unknown;
};

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { status, statusCode } = error as HttpLikeError;
  const value = typeof status === 'number' ? status : statusCode;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
};

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  // Xử lý lỗi validate dữ liệu đầu vào Zod
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đầu vào không hợp lệ.',
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  const httpError = (typeof error === 'object' && error !== null ? error : {}) as HttpLikeError;
  const status = getHttpStatus(error);

  // Body JSON sai cú pháp (body-parser).
  if (httpError.type === 'entity.parse.failed') {
    response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Dữ liệu gửi lên không phải JSON hợp lệ.',
      },
    });
    return;
  }

  // Body vượt quá giới hạn kích thước.
  if (httpError.type === 'entity.too.large' || status === 413) {
    response.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Dữ liệu gửi lên vượt quá kích thước cho phép.',
      },
    });
    return;
  }

  // Các lỗi 4xx khác mà thư viện đánh dấu là an toàn để trả về client.
  if (status !== undefined && status >= 400 && status < 500 && httpError.expose === true) {
    response.status(status).json({
      error: {
        code: CLIENT_ERROR_CODES[status] ?? 'BAD_REQUEST',
        message: 'Yêu cầu không hợp lệ.',
      },
    });
    return;
  }

  // Lỗi không lường trước: chỉ ghi chi tiết vào log máy chủ, không trả về client.
  console.error('[Unhandled Error]:', error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: GENERIC_SERVER_ERROR_MESSAGE,
    },
  });
};
