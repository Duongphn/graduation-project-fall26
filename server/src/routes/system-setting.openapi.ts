import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import { successResponseSchema } from '../validations/common.validation.js';
import {
  adminSettingSchema,
  publicSettingsSchema,
  resetSettingBodySchema,
  settingKeyParamsSchema,
  updateSettingBodySchema,
} from '../validations/system-setting.validation.js';
import { z } from '../validations/zod.js';

const ADMIN = '/api/v1/admin/settings';
const tags = ['System settings'];
const one = (description: string) => ({
  description,
  content: jsonContent(successResponseSchema(adminSettingSchema)),
});

openApiRegistry.registerPath({
  method: 'get',
  path: ADMIN,
  tags,
  summary: 'List the system settings by group (Admin, UC30 Setting List)',
  description:
    'Every setting of the catalogue with its value in use, default, unit, allowed range and last ' +
    'change (Admin and time). Rates are in percent. A stored value that is not valid is shown in ' +
    'invalidStoredValue and the default is used.',
  security: bearerAuthSecurity,
  responses: {
    200: {
      description: 'Settings in group order',
      content: jsonContent(successResponseSchema(z.array(adminSettingSchema))),
    },
    ...errorResponses(401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${ADMIN}/{key}`,
  tags,
  summary: 'One system setting (Admin, UC30 Setting Detail)',
  security: bearerAuthSecurity,
  request: { params: settingKeyParamsSchema },
  responses: { 200: one('Setting'), ...errorResponses(401, 403, 404) },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: `${ADMIN}/{key}`,
  tags,
  summary: 'Change a system setting (Admin)',
  description:
    'The value is checked against the setting (range, whole number or at most 2 decimals; the ' +
    'minimum withdrawal cannot exceed the maximum). 400 VALIDATION_ERROR with details[field=value] ' +
    'otherwise, also when it equals the value in use. Writes one audit row setting.update with the ' +
    'old and new value. The new value applies only to transactions created after the save (GB-38).',
  security: bearerAuthSecurity,
  request: {
    params: settingKeyParamsSchema,
    body: { content: jsonContent(updateSettingBodySchema) },
  },
  responses: { 200: one('Saved'), ...errorResponses(400, 401, 403, 404) },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${ADMIN}/{key}/reset`,
  tags,
  summary: 'Set a system setting back to its default (Admin)',
  description:
    '409 SETTING_ALREADY_DEFAULT when the default is already in use. Writes one audit row ' +
    'setting.reset with the old and new value (GB-38 as for a change).',
  security: bearerAuthSecurity,
  request: {
    params: settingKeyParamsSchema,
    body: { content: jsonContent(resetSettingBodySchema) },
  },
  responses: { 200: one('Default restored'), ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/settings/public',
  tags,
  summary: 'Settings shown to every user (withdrawal limits), no sign-in',
  responses: {
    200: {
      description: 'Public settings',
      content: jsonContent(successResponseSchema(publicSettingsSchema)),
    },
  },
});
