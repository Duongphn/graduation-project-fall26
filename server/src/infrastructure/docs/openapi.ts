import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { apiErrorSchema, paginationMetaSchema } from '../../shared/http/schemas.js';
import type { z } from '../../shared/validation/zod.js';

// One registry for the whole API. Each feature registers its paths in <feature>.openapi.ts with
// the same Zod schemas it validates with, so Swagger never drifts from the code
// (api-conventions.md §4). Feature openapi files must be imported before the first request to
// /api/docs (app/router.ts imports them through the feature routes).
export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.register('ApiErrorResponse', apiErrorSchema);
openApiRegistry.register('PaginationMeta', paginationMetaSchema);

// Development header accepted while ALLOW_DEV_AUTH=true (shared/middleware/auth-placeholder.ts).
openApiRegistry.registerComponent('securitySchemes', 'devUserId', {
  type: 'apiKey',
  in: 'header',
  name: 'x-dev-user-id',
  description:
    'Development and tests only (ALLOW_DEV_AUTH=true, NODE_ENV development/test): id of an ' +
    'existing, unlocked user. The role comes from the users collection.',
});

/** Spread into registerPath({ security }) for every guarded route. */
export const devAuthSecurity = [{ devUserId: [] }];

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
      description: 'REST API of ToyFlow. Envelopes follow server/docs/api-conventions.md.',
    },
    servers: [{ url: '/' }],
  });

let cachedDocument: ReturnType<typeof buildOpenApiDocument> | undefined;

/** The OpenAPI document, built once on first use (every path is registered by then). */
export const getOpenApiDocument = () => {
  cachedDocument ??= buildOpenApiDocument();
  return cachedDocument;
};

// GET /api/docs (Swagger UI) and GET /api/docs/json (raw spec).
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
