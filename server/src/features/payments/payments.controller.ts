import type { NextFunction, Request, Response } from 'express';
import { PaymentsService } from './payments.service.js';
import {
  createPaymentLinkSchema,
  cancelPaymentLinkSchema,
  orderCodeParamSchema,
  confirmWebhookSchema,
} from './payments.validation.js';

export class PaymentsController {
  private readonly paymentsService: PaymentsService;

  public constructor(paymentsService = new PaymentsService()) {
    this.paymentsService = paymentsService;
  }

  /**
   * POST /api/v1/payments/create-link
   * Tạo link thanh toán VietQR / PayOS
   */
  public createPaymentLink = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createPaymentLinkSchema.parse(req.body);
      const actorUserId = req.auth?.userId;

      const result = await this.paymentsService.createPaymentLink(validated, actorUserId);
      res.status(201).json({
        success: true,
        message: 'Tạo link thanh toán PayOS thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/payments/order/:orderCode
   * Tra cứu thông tin đơn hàng và đồng bộ trạng thái thanh toán từ PayOS
   */
  public getPaymentByOrderCode = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = orderCodeParamSchema.parse(req.params);
      const result = await this.paymentsService.getPaymentByOrderCode(validated.orderCode);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/payments/cancel/:orderCode
   * Hủy link thanh toán qua PayOS
   */
  public cancelPayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const paramVal = orderCodeParamSchema.parse(req.params);
      const bodyVal = cancelPaymentLinkSchema.parse(req.body);

      const result = await this.paymentsService.cancelPayment(paramVal.orderCode, bodyVal);

      res.status(200).json({
        success: true,
        message: 'Đã hủy link thanh toán thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/payments/payos-webhook
   * Webhook tự động nhận thông báo từ PayOS khi thanh toán thành công
   */
  public handleWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.paymentsService.handleWebhook(req.body);
      res.status(200).json({
        success: true,
        message: 'Webhook xử lý thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/payments/confirm-webhook
   * Đăng ký và kích hoạt webhook URL với máy chủ PayOS
   */
  public confirmWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = confirmWebhookSchema.parse(req.body);
      const result = await this.paymentsService.confirmWebhookUrl(validated.webhookUrl);

      res.status(200).json({
        success: true,
        message: 'Xác nhận webhook URL thành công với PayOS',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}
