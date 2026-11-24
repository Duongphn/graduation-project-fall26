import type { NextFunction, Request, Response } from 'express';
import { getValidatedParams, getValidatedQuery } from '../middlewares/validate.js';
import type { PayosTopupService } from '../services/payos-topup.service.js';
import { sendSuccess } from '../utils/response.js';
import type { PayosCodeParams, PayosReturnQuery, PayosTopupBody } from '../validations/payment.validation.js';

/** UC17: PayOS top-up endpoints (routes/payment.routes.ts) */
export class PaymentController {
  public constructor(private readonly payos: PayosTopupService) {}

  public createPayosTopup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { amount } = req.body as PayosTopupBody;
      sendSuccess(res, await this.payos.createTopup(req.auth!, amount), { status: 201 });
    } catch (err) {
      next(err);
    }
  };

  /** The frontend PayOS result page: asks PayOS for the status and settles the payment */
  public handlePayosReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderCode } = getValidatedQuery<PayosReturnQuery>(res);
      const result = await this.payos.confirmReturn(req.auth!, orderCode);
      res.status(200).json({ success: result.success, data: result });
    } catch (err) {
      next(err);
    }
  };

  /** ToyFlow's QR page: transfer details of the owner's PayOS top-up */
  public getPayosCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = getValidatedParams<PayosCodeParams>(res);
      sendSuccess(res, await this.payos.getCheckout(req.auth!, code));
    } catch (err) {
      next(err);
    }
  };

  public cancelPayosTopup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = getValidatedParams<PayosCodeParams>(res);
      const result = await this.payos.cancel(req.auth!, code);
      res.status(200).json({ success: result.success, data: result });
    } catch (err) {
      next(err);
    }
  };

  /** PayOS server-to-server notification of a paid transfer */
  public handlePayosWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      sendSuccess(res, await this.payos.handleWebhook(req.body));
    } catch (err) {
      next(err);
    }
  };
}
