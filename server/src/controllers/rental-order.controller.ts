import type { NextFunction, Request, Response } from 'express';
import { type DisputeService } from '../services/dispute.service.js';
import { type RentalOrderService } from '../services/rental-order.service.js';
import { AppError } from '../utils/app-error.js';
import {
  validateRejectRentalInput,
  validateRentalListQuery,
  validateRentalPeriodInput,
  validateReturnRentalInput,
  validateSettleRentalInput,
} from '../validations/rental-order.validation.js';

/** The legacy settle endpoint keeps its old error contract for the DAMAGED path. */
function toSettleError(err: unknown): unknown {
  if (err instanceof AppError && err.code === 'COMPLAINT_WINDOW_CLOSED') {
    return new AppError(409, 'INVALID_RENTAL_TRANSITION', 'Đã quá thời hạn thực hiện thao tác này.');
  }
  if (err instanceof AppError && err.code === 'DISPUTE_ALREADY_EXISTS') {
    return new AppError(409, 'INVALID_RENTAL_TRANSITION', 'Đơn thuê không ở trạng thái phù hợp.');
  }
  return err;
}

export class RentalOrderController {
  public constructor(
    private readonly service: RentalOrderService,
    private readonly disputes: DisputeService,
  ) {}

  public quote = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = validateRentalPeriodInput(req.body);
      const data = await this.service.quote(req.auth!, input);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = validateRentalPeriodInput(req.body);
      const data = await this.service.create(req.auth!, input);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public accept = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const data = await this.service.accept(req.auth!, orderId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public pay = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const data = await this.service.pay(req.auth!, orderId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public reject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { reason } = validateRejectRentalInput(req.body);
      const data = await this.service.reject(req.auth!, orderId, reason);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const data = await this.service.get(req.auth!, orderId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = validateRentalListQuery(req.query);
      const data = await this.service.list(req.auth!, query);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public history = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const data = await this.service.history(req.auth!, orderId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public ship = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const files = (req.files as Express.Multer.File[]) ?? [];
      const data = await this.service.ship(req.auth!, orderId, files);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public receive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const files = (req.files as Express.Multer.File[]) ?? [];
      const data = await this.service.receive(req.auth!, orderId, files);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public returnToy = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const files = (req.files as Express.Multer.File[]) ?? [];
      const { note } = validateReturnRentalInput(req.body);
      const data = await this.service.requestReturn(req.auth!, orderId, files, note);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public settle = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const input = validateSettleRentalInput(req.body);
      const files = (req.files as Express.Multer.File[]) ?? [];
      if (input.result === 'DAMAGED') {
        await this.service.assertCanSettle(req.auth!, orderId);
        const { order } = await this.disputes
          .open(
            req.auth!,
            orderId,
            {
              reason: input.reason ?? 'DAMAGED_ON_RETURN',
              description: input.description ?? '',
            },
            files,
          )
          .catch((err: unknown) => {
            throw toSettleError(err);
          });
        res.status(200).json({ success: true, data: order });
        return;
      }
      const data = await this.service.settle(req.auth!, orderId, input);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
