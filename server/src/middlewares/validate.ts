import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodError, ZodType } from 'zod';

import { AppError } from '../utils/app-error.js';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export const toValidationDetails = (error: ZodError, prefix?: string): ValidationErrorDetail[] =>
  error.issues.map((issue) => ({
    field: [prefix, ...issue.path.map(String)].filter(Boolean).join('.') || '(root)',
    message: issue.message,
  }));

interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

// Validates body, query and params with Zod (api-conventions.md §4). The parsed body replaces
// req.body; Express 5 makes req.query read-only, so the parsed query and params are kept in
// res.locals and read with getValidatedQuery / getValidatedParams.
export const validateRequest =
  (schemas: RequestSchemas): RequestHandler =>
  (request: Request, response: Response, next: NextFunction) => {
    const details: ValidationErrorDetail[] = [];
    const parsed: Record<string, unknown> = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(request[part] ?? {});
      if (result.success) {
        parsed[part] = result.data;
      } else {
        details.push(...toValidationDetails(result.error, part === 'body' ? undefined : part));
      }
    }

    if (details.length > 0) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu yêu cầu không hợp lệ.', details));
      return;
    }
    if ('body' in parsed) request.body = parsed.body;
    response.locals.validatedQuery = parsed.query;
    response.locals.validatedParams = parsed.params;
    next();
  };

export const getValidatedQuery = <T>(response: Response): T => response.locals.validatedQuery as T;

export const getValidatedParams = <T>(response: Response): T =>
  response.locals.validatedParams as T;

// The body after validateRequest has parsed it (validateRequest replaces request.body).
export const getValidatedBody = <T>(request: Request): T => request.body as T;
