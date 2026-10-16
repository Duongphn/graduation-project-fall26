import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Không tìm thấy đường dẫn ${request.method} ${request.originalUrl}.`,
    },
  });
};
