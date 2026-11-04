import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import type { PaymentService } from '../services/payment.service.js';
import { AppError } from '../utils/app-error.js';
import { validateTopupInput } from '../validations/payment.validation.js';

export class PaymentController {
  public constructor(private readonly paymentService: PaymentService) {}

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const rawIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : req.socket?.remoteAddress || '127.0.0.1';

    // Chuẩn hóa IPv6 loopback và IPv4-mapped IPv6
    const ip = rawIp || '127.0.0.1';
    return ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, '');
  }

  /**
   * POST /api/v1/wallets/topup/vnpay hoặc POST /api/v1/payments/topup/vnpay
   * Yêu cầu đăng nhập: Tạo payment pending và trả về VNPay URL
   */
  public createTopup: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const input = validateTopupInput(req.body);
      const clientIp = this.getClientIp(req);
      const data = await this.paymentService.createTopupPayment(req.auth.userId, input, clientIp);

      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/payments/vnpay-return
   * URL khách hàng được chuyển hướng về sau khi thanh toán trên VNPay
   */
  public handleVnpayReturn: RequestHandler = async (req, res, next) => {
    try {
      const result = await this.paymentService.processReturn(
        req.query as Record<string, unknown>,
      );

      // Nếu là request từ trình duyệt (Accept text/html), redirect về trang kết quả Frontend
      const acceptsHtml = req.headers.accept?.includes('text/html');
      if (acceptsHtml && env.vnpayReturnUrl) {
        const queryParams = new URLSearchParams({
          status: result.status,
          paymentCode: result.paymentCode ?? '',
          amount: String(result.amount ?? ''),
          message: result.message,
        });

        const targetUrl = env.vnpayReturnUrl.includes('?')
          ? `${env.vnpayReturnUrl}&${queryParams.toString()}`
          : `${env.vnpayReturnUrl}?${queryParams.toString()}`;

        res.redirect(targetUrl);
        return;
      }

      // Trả JSON nếu gọi qua API/Fetch
      res.status(200).json({ success: result.success, data: result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/payments/vnpay-ipn
   * Webhook Server-to-Server từ VNPay
   */
  public handleVnpayIpn: RequestHandler = async (req, res, next) => {
    try {
      const result = await this.paymentService.processIpn(
        req.query as Record<string, unknown>,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/payments/:code/status
   * Tra cứu trạng thái giao dịch nạp tiền
   */
  public getPaymentStatus: RequestHandler = async (req, res, next) => {
    try {
      const rawCode = req.params.code;
      const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
      if (!code) {
        throw new AppError(400, 'INVALID_CODE', 'Mã giao dịch là bắt buộc.');
      }

      const payment = await this.paymentService.getPaymentByCode(code);
      if (!payment) {
        throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch.');
      }

      res.status(200).json({
        success: true,
        data: {
          code: payment.code,
          amount: payment.amount,
          status: payment.status,
          gateway: payment.gateway,
          gatewayTransactionNo: payment.gatewayTransactionNo ?? null,
          createdAt: payment.createdAt,
          expiresAt: payment.expiresAt ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
