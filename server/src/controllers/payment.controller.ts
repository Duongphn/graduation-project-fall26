import type { NextFunction, Request, Response } from 'express';
import { getValidatedParams } from '../middlewares/validate.js';
import type { PaymentService } from '../services/payment.service.js';
import { sendSuccess } from '../utils/response.js';
import type { PaymentCodeParams, TopupBody } from '../validations/payment.validation.js';

/** Client IP for vnp_IpAddr (req.ip honours TRUST_PROXY behind Render) */
const clientIpOf = (req: Request) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? '127.0.0.1';
  return ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, '');
};

/** UC17: VNPay top-up endpoints (routes/payment.routes.ts) */
export class PaymentController {
  public constructor(private readonly service: PaymentService) {}

  public createTopup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.createTopupPayment(req.auth!, req.body as TopupBody, clientIpOf(req));
      sendSuccess(res, data, { status: 201 });
    } catch (err) {
      next(err);
    }
  };

  /** The frontend result page forwards the query VNPay redirected the browser with */
  public handleReturn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.processReturn(req.query as Record<string, unknown>);
      // Same envelope as the lead's API: success follows the payment result, data always present
      res.status(200).json({ success: result.success, data: result });
    } catch (err) {
      next(err);
    }
  };

  /** VNPay server-to-server notification: always 200 with RspCode/Message */
  public handleIpn = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json(await this.service.processIpn(req.query as Record<string, unknown>));
    } catch (err) {
      console.error('[vnpay-ipn] failed', err);
      res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
  };

  public getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = getValidatedParams<PaymentCodeParams>(res);
      sendSuccess(res, await this.service.getPaymentStatus(req.auth!, code));
    } catch (err) {
      next(err);
    }
  };
}
