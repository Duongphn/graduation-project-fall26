import type { Request, Response } from 'express';
import { getValidatedBody, getValidatedParams, getValidatedQuery } from '../middlewares/validate.js';
import { type RentalDisputeService } from '../services/rental-dispute.service.js';
import { getAdminContext } from '../utils/admin-context.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import type { IdParams } from '../validations/common.validation.js';
import type {
  DisputeListQuery,
  ResolveDisputeBody,
} from '../validations/rental-dispute.validation.js';

/** Admin giải quyết khiếu nại đơn thuê (UC19). */
export class RentalDisputeController {
  public constructor(private readonly service: RentalDisputeService) {}

  public list = async (_request: Request, response: Response): Promise<void> => {
    const query = getValidatedQuery<DisputeListQuery>(response);
    const { items, total } = await this.service.list(query);
    sendPaginated(response, items, query, total);
  };

  public detail = async (_request: Request, response: Response): Promise<void> => {
    const { id } = getValidatedParams<IdParams>(response);
    sendSuccess(response, await this.service.detail(id));
  };

  public resolve = async (request: Request, response: Response): Promise<void> => {
    const { id } = getValidatedParams<IdParams>(response);
    const admin = getAdminContext(request);
    const result = await this.service.resolve(
      admin.actor.actorId,
      id,
      getValidatedBody<ResolveDisputeBody>(request),
    );
    sendSuccess(response, result, { message: 'Đã ra phán quyết và quyết toán đơn thuê.' });
  };
}
