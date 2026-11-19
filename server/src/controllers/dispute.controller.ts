import type { NextFunction, Request, Response } from 'express';
import { type DisputeService } from '../services/dispute.service.js';
import {
  validateAdminDisputeListQuery,
  validateListDisputesQuery,
  validateResolveDisputeInput,
} from '../validations/dispute.validation.js';

export class DisputeController {
  public constructor(private readonly service: DisputeService) {}

  /** The body is validated by the service, after it knows the caller is a party of the order. */
  public open = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const files = (req.files as Express.Multer.File[]) ?? [];
      const data = await this.service.open(req.auth!, orderId, req.body, files);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  /** The body is validated by the service, after it knows the caller may see the dispute. */
  public respond = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = (req.files as Express.Multer.File[]) ?? [];
      const data = await this.service.respond(req.auth!, req.params.id as string, req.body, files);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getForParty(req.auth!, req.params.id as string);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.listMine(req.auth!, validateListDisputesQuery(req.query));
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public adminList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.adminList(validateAdminDisputeListQuery(req.query));
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public adminCaseFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.adminCaseFile(req.params.id as string);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public resolve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = validateResolveDisputeInput(req.body);
      const data = await this.service.resolve(req.auth!, req.params.id as string, input);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
