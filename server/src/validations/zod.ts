import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Import "z" from here, not from "zod": this copy is extended with .openapi() so that every
// request schema is also the Swagger documentation (docs/api-conventions.md §4).
extendZodWithOpenApi(z);

export { z };
