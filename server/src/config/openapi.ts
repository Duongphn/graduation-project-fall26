import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { apiErrorSchema, paginationMetaSchema } from '../validations/common.validation.js';
import type { z } from '../validations/zod.js';

// One registry for the whole API. Each feature registers its paths in <feature>.openapi.ts with
// the same Zod schemas it validates with, so Swagger never drifts from the code
// (api-conventions.md §4). Feature openapi files must be imported before the first request to
// the docs (app/router.ts imports them through the feature routes).
export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.register('ApiErrorResponse', apiErrorSchema);
openApiRegistry.register('PaginationMeta', paginationMetaSchema);

// Access token issued by /auth/login, checked by develop's shared/middleware/authenticate.ts.
openApiRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

/** Spread into registerPath({ security }) for every guarded route. */
export const bearerAuthSecurity = [{ bearerAuth: [] }];
/** Kept name for the feature openapi files: the same bearer JWT security. */

/** `content` of a JSON request body or response. */
export const jsonContent = (schema: z.ZodType) => ({ 'application/json': { schema } });

const errorDescriptions = {
  400: 'Invalid request',
  401: 'Not signed in',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  422: 'Business rule violated',
  413: 'Request body too large',
  503: 'Service not configured',
} as const;

/** Standard error responses to spread into registerPath({ responses }). */
export const errorResponses = (...statuses: Array<keyof typeof errorDescriptions>) =>
  Object.fromEntries(
    statuses.map((status) => [
      status,
      { description: errorDescriptions[status], content: jsonContent(apiErrorSchema) },
    ]),
  );

const buildOpenApiDocument = () =>
  new OpenApiGeneratorV3(openApiRegistry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'ToyFlow API',
      version: '0.1.0',
      description:
        'REST API of ToyFlow. Errors: { error: { code, message, details? } }; the admin and donation endpoints answer { success, data }.',
    },
    servers: [{ url: '/' }],
  });

let cachedDocument: ReturnType<typeof buildOpenApiDocument> | undefined;

/** The OpenAPI document, built once on first use (every path is registered by then). */
export const getOpenApiDocument = () => {
  cachedDocument ??= buildOpenApiDocument();
  return cachedDocument;
};

// GET <mount>/ (Swagger UI) and GET <mount>/json (raw spec).
export const createDocsRouter = (): Router => {
  const router = Router();
  router.get('/json', (_request, response) => {
    response.json(getOpenApiDocument());
  });
  router.use('/', swaggerUi.serve);
  router.get('/', (request, response, next) => {
    swaggerUi.setup(getOpenApiDocument())(request, response, next);
  });
  return router;
};
