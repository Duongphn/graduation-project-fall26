import type { Request, Response } from 'express';

import { getAdminContext } from '../../shared/http/admin-context.js';
import type { IdParams } from '../../shared/http/schemas.js';
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../shared/middleware/validate.js';
import { sendCreated, sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import type {
  AdminOrganizationListQuery,
  CreateOrganizationBody,
  PublicOrganizationListQuery,
  UpdateOrganizationBody,
} from './organizations.schemas.js';
import * as service from './organizations.service.js';

const organizationId = (response: Response): string => getValidatedParams<IdParams>(response).id;

export const adminOrganizationsController = {
  list: async (_request: Request, response: Response) => {
    const query = getValidatedQuery<AdminOrganizationListQuery>(response);
    const { items, total } = await service.listOrganizationsForAdmin(query);
    sendPaginated(response, items, query, total);
  },

  get: async (_request: Request, response: Response) => {
    sendSuccess(response, await service.getOrganizationForAdmin(organizationId(response)));
  },

  create: async (request: Request, response: Response) => {
    const organization = await service.createOrganization(
      getValidatedBody<CreateOrganizationBody>(request),
      getAdminContext(request),
    );
    sendCreated(response, organization, 'Đã thêm tổ chức từ thiện.');
  },

  update: async (request: Request, response: Response) => {
    const organization = await service.updateOrganization(
      organizationId(response),
      getValidatedBody<UpdateOrganizationBody>(request),
      getAdminContext(request),
    );
    sendSuccess(response, organization, { message: 'Đã cập nhật tổ chức từ thiện.' });
  },

  hide: async (request: Request, response: Response) => {
    const { organization, message } = await service.hideOrganization(
      organizationId(response),
      getAdminContext(request),
    );
    sendSuccess(response, organization, { message });
  },

  show: async (request: Request, response: Response) => {
    const { organization, message } = await service.showOrganization(
      organizationId(response),
      getAdminContext(request),
    );
    sendSuccess(response, organization, { message });
  },

  remove: async (request: Request, response: Response) => {
    await service.deleteOrganizationById(organizationId(response), getAdminContext(request));
    sendSuccess(response, null, { message: 'Đã xoá tổ chức từ thiện.' });
  },
};

export const publicOrganizationsController = {
  list: async (_request: Request, response: Response) => {
    const query = getValidatedQuery<PublicOrganizationListQuery>(response);
    const { items, total } = await service.listPublicOrganizations(query);
    sendPaginated(response, items, query, total);
  },

  get: async (_request: Request, response: Response) => {
    sendSuccess(response, await service.getPublicOrganization(organizationId(response)));
  },
};
