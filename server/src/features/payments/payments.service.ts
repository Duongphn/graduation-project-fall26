import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { getPayOSClient } from '../../infrastructure/payos/payos-client.js';
import { AppError } from '../../shared/errors/app-error.js';
import { Payment } from './payments.model.js';
import type {
  CreatePaymentLinkInput,
  CancelPaymentLinkInput,
} from './payments.validation.js';

/**
 * Chuẩn hóa mô tả chuyển khoản cho PayOS:
 * - Tối đa 25 ký tự
 * - Bỏ dấu tiếng Việt và các ký tự đặc biệt
 */
export function sanitizePayOSDescription(rawDesc?: string, fallbackOrderCode?: number): string {
  if (!rawDesc || !rawDesc.trim()) {
    return fallbackOrderCode ? `DH${fallbackOrderCode}`.slice(0, 25) : 'THANH TOAN';
  }

  const normalized = rawDesc
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .slice(0, 25);

  return normalized || (fallbackOrderCode ? `DH${fallbackOrderCode}`.slice(0, 25) : 'THANH TOAN');
}

/**
 * Sinh mã đơn hàng số nguyên ngẫu nhiên duy nhất (1 - 9007199254740991)
 */
export async function generateUniqueOrderCode(): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const timestampSec = Math.floor(Date.now() / 1000);
    const randomSuffix = Math.floor(100 + Math.random() * 900); // 3 chữ số
    const orderCode = Number(`${timestampSec}${randomSuffix}`);

    const existing = await Payment.findOne({ code: String(orderCode) }).lean();
    if (!existing) {
      return orderCode;
    }
  }

  // Fallback nếu trùng liên tục
  return Date.now();
}

export class PaymentsService {
  /**
   * Tạo link thanh toán VietQR / PayOS
   */
  public async createPaymentLink(
    input: CreatePaymentLinkInput,
    actorUserId?: string,
  ) {
    const payos = getPayOSClient();

    // Xác định userId liên kết
    const finalUserId = input.userId || actorUserId;
    if (!finalUserId || !mongoose.Types.ObjectId.isValid(finalUserId)) {
      throw new AppError(
        400,
        'INVALID_USER_ID',
        'Cần cung cấp userId hợp lệ để tạo giao dịch thanh toán.',
      );
    }

    const orderCode = await generateUniqueOrderCode();
    const description = sanitizePayOSDescription(input.description, orderCode);

    const defaultReturnUrl = `${env.corsOrigin}/payment/success?orderCode=${orderCode}`;
    const defaultCancelUrl = `${env.corsOrigin}/payment/cancel?orderCode=${orderCode}`;

    const returnUrl = input.returnUrl || defaultReturnUrl;
    const cancelUrl = input.cancelUrl || defaultCancelUrl;

    const orderId = input.orderId
      ? new mongoose.Types.ObjectId(input.orderId)
      : new mongoose.Types.ObjectId();

    // 1. Gọi PayOS tạo Payment Link
    let payosResponse;
    try {
      const payload: Parameters<typeof payos.paymentRequests.create>[0] = {
        orderCode,
        amount: input.amount,
        description,
        returnUrl,
        cancelUrl,
      };

      if (input.buyerName) {
        payload.buyerName = input.buyerName;
      }
      if (input.buyerEmail) {
        payload.buyerEmail = input.buyerEmail;
      }
      if (input.buyerPhone) {
        payload.buyerPhone = input.buyerPhone;
      }

      payosResponse = await payos.paymentRequests.create(payload);
    } catch (err: any) {
      throw new AppError(
        502,
        'PAYOS_GATEWAY_ERROR',
        `Lỗi khi kết nối cổng PayOS: ${err?.message || 'Không thể tạo link thanh toán'}`,
        err,
      );
    }

    // 2. Lưu thông tin giao dịch vào MongoDB
    const payment = await Payment.create({
      code: String(orderCode),
      userId: new mongoose.Types.ObjectId(finalUserId),
      orderType: input.orderType || 'order',
      orderId,
      amount: input.amount,
      gateway: 'payos',
      gatewayTransactionNo: payosResponse.paymentLinkId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // Hết hạn sau 15 phút
    });

    return {
      paymentId: payment._id,
      orderCode,
      orderId: payment.orderId,
      amount: input.amount,
      description,
      checkoutUrl: payosResponse.checkoutUrl,
      qrCode: payosResponse.qrCode,
      paymentLinkId: payosResponse.paymentLinkId,
      status: payment.status,
      expiresAt: payment.expiresAt,
    };
  }

  /**
   * Lấy thông tin thanh toán & đồng bộ trạng thái mới nhất từ PayOS
   */
  public async getPaymentByOrderCode(orderCode: number | string) {
    const numericCode = Number(orderCode);
    if (!Number.isSafeInteger(numericCode) || numericCode <= 0) {
      throw new AppError(400, 'INVALID_ORDER_CODE', 'Mã đơn hàng không hợp lệ.');
    }

    const payment = await Payment.findOne({ code: String(numericCode) });
    if (!payment) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy thông tin thanh toán trong hệ thống.');
    }

    const payos = getPayOSClient();
    let payosData: any = null;

    try {
      payosData = await payos.paymentRequests.get(numericCode);

      // Tự động đồng bộ trạng thái DB nếu trên PayOS đã thanh toán hoặc đã hủy
      if (payosData) {
        if (payosData.status === 'PAID' && payment.status !== 'completed') {
          payment.status = 'completed';
          await payment.save();
        } else if (payosData.status === 'CANCELLED' && payment.status !== 'cancelled') {
          payment.status = 'cancelled';
          await payment.save();
        }
      }
    } catch (error) {
      // Nếu truy vấn PayOS gặp lỗi tạm thời, vẫn trả về dữ liệu DB hiện tại
      console.warn(`[PaymentsService] Không thể đồng bộ từ PayOS cho orderCode ${numericCode}:`, error);
    }

    return {
      payment,
      payos: payosData,
    };
  }

  /**
   * Hủy link thanh toán qua PayOS
   */
  public async cancelPayment(orderCode: number | string, input?: CancelPaymentLinkInput) {
    const numericCode = Number(orderCode);
    if (!Number.isSafeInteger(numericCode) || numericCode <= 0) {
      throw new AppError(400, 'INVALID_ORDER_CODE', 'Mã đơn hàng không hợp lệ.');
    }

    const payment = await Payment.findOne({ code: String(numericCode) });
    if (!payment) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy thông tin thanh toán trong hệ thống.');
    }

    if (payment.status === 'completed') {
      throw new AppError(400, 'PAYMENT_ALREADY_COMPLETED', 'Giao dịch đã hoàn tất thanh toán, không thể hủy.');
    }

    const payos = getPayOSClient();
    const reason = input?.cancellationReason || 'Khách hàng yêu cầu hủy thanh toán';

    let payosResult;
    try {
      payosResult = await payos.paymentRequests.cancel(numericCode, reason);
    } catch (err: any) {
      throw new AppError(
        502,
        'PAYOS_CANCEL_ERROR',
        `Không thể hủy trên cổng PayOS: ${err?.message || 'Lỗi xử lý'}`,
      );
    }

    payment.status = 'cancelled';
    await payment.save();

    return {
      orderCode: numericCode,
      status: 'cancelled',
      cancellationReason: reason,
      payos: payosResult,
    };
  }

  /**
   * Xử lý Webhook gửi từ PayOS khi thanh toán thành công
   */
  public async handleWebhook(body: any) {
    const payos = getPayOSClient();

    let verifiedData;
    try {
      verifiedData = await payos.webhooks.verify(body);
    } catch (err: any) {
      throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', `Chữ ký Webhook không hợp lệ: ${err?.message || ''}`);
    }

    if (!verifiedData) {
      throw new AppError(400, 'INVALID_WEBHOOK_DATA', 'Dữ liệu Webhook rỗng.');
    }

    const orderCode = verifiedData.orderCode;
    const payment = await Payment.findOne({ code: String(orderCode) });

    if (payment) {
      // Cập nhật trạng thái completed
      payment.status = 'completed';
      if (verifiedData.reference) {
        payment.gatewayTransactionNo = verifiedData.reference;
      }
      await payment.save();
    }

    return {
      success: true,
      orderCode,
      amount: verifiedData.amount,
      reference: verifiedData.reference,
      status: 'completed',
    };
  }

  /**
   * Xác nhận Webhook URL với máy chủ PayOS
   */
  public async confirmWebhookUrl(webhookUrl: string) {
    const payos = getPayOSClient();
    try {
      const result = await payos.webhooks.confirm(webhookUrl);
      return result;
    } catch (err: any) {
      throw new AppError(502, 'PAYOS_WEBHOOK_CONFIRM_ERROR', `Không thể xác nhận webhook URL: ${err?.message || ''}`);
    }
  }
}
