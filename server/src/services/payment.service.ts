import mongoose from 'mongoose';
import { env } from '../config/env.js';
import type { VNPayPaymentGateway } from '../interfaces/payment.ports.js';
import type { IPayment, PaymentStatus } from '../models/payment.model.js';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { WalletRepository } from '../repositories/wallet.repository.js';
import type { LedgerService } from './ledger.service.js';
import type { TopupInput } from '../validations/payment.validation.js';
import { AppError } from '../utils/app-error.js';

export interface TopupResult {
  paymentUrl: string;
  paymentCode: string;
  amount: number;
}

export interface ProcessReturnResult {
  success: boolean;
  status: string;
  paymentCode?: string | undefined;
  amount?: number | undefined;
  message: string;
}

export class PaymentService {
  public constructor(
    private readonly paymentRepository: PaymentRepository = new PaymentRepository(),
    private readonly walletRepository: WalletRepository = new WalletRepository(),
    private readonly ledgerService: LedgerService,
    private readonly vnpayGateway: VNPayPaymentGateway,
  ) {}

  /**
   * Khởi tạo giao dịch Nạp tiền vào ví và sinh URL thanh toán VNPay Sandbox
   */
  public async createTopupPayment(
    userId: string,
    input: TopupInput,
    clientIp: string,
  ): Promise<TopupResult> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'User ID không hợp lệ.');
    }

    const wallet = await this.walletRepository.getOrCreateUserWallet(userId);
    if (wallet.status !== 'active') {
      throw new AppError(400, 'WALLET_INACTIVE', 'Ví người dùng đang bị khóa hoặc không hoạt động.');
    }

    const timestamp = Date.now();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentCode = `TOPUP_${timestamp}_${randomSuffix}`;

    // Lưu giao dịch Pending vào cơ sở dữ liệu
    await this.paymentRepository.create({
      code: paymentCode,
      userId: new mongoose.Types.ObjectId(userId),
      orderType: 'wallet_topup',
      orderId: wallet._id,
      amount: input.amount,
      gateway: 'vnpay',
      status: 'pending',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // Hết hạn sau 15 phút
    });

    // Sinh Payment URL gửi sang cổng VNPay
    const paymentUrl = this.vnpayGateway.buildPaymentUrl({
      tmnCode: env.vnpayTmnCode,
      hashSecret: env.vnpayHashSecret,
      paymentUrl: env.vnpayUrl,
      returnUrl: env.vnpayReturnUrl,
      amount: input.amount,
      txnRef: paymentCode,
      orderInfo: `Nap tien vi ToyFlow ${paymentCode}`,
      clientIp: clientIp || '127.0.0.1',
      bankCode: input.bankCode,
    });

    return {
      paymentUrl,
      paymentCode,
      amount: input.amount,
    };
  }

  /**
   * Xử lý Webhook IPN (Server-to-Server) từ VNPay
   * Đảm bảo: Xác thực chữ ký checksum, kiểm tra số tiền, chỉ cộng tiền vào ví 1 lần (Idempotency)
   */
  public async processIpn(
    query: Record<string, unknown>,
  ): Promise<{ RspCode: string; Message: string }> {
    const isValid = this.vnpayGateway.verifySignature(query, env.vnpayHashSecret);
    if (!isValid) {
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    const txnRef = String(query.vnp_TxnRef || '');
    const payment = await this.paymentRepository.findByCode(txnRef);
    if (!payment) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    const vnpAmount = Math.round(Number(query.vnp_Amount || 0) / 100);
    if (vnpAmount !== payment.amount) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    // Nếu đơn đã được xử lý trước đó (qua Return URL hoặc lần IPN trước)
    if (payment.status !== 'pending') {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    const responseCode = String(query.vnp_ResponseCode || '');
    const transactionStatus = String(query.vnp_TransactionStatus || '');
    const transactionNo = String(query.vnp_TransactionNo || '');

    if (responseCode === '00' && transactionStatus === '00') {
      // Ghi bút toán sổ cái (Ledger Single Entry) với Idempotency Key
      await this.ledgerService.recordSingleEntry({
        walletId: payment.orderId,
        postingKey: `topup_vnpay_${payment.code}`,
        amount: payment.amount,
        type: 'credit',
        reference: {
          kind: 'payment',
          id: payment._id,
        },
        description: `Nạp tiền ví qua VNPay (${payment.code})`,
      });

      await this.paymentRepository.updateStatus(payment.code, 'success', transactionNo);
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    // Giao dịch không thành công: khách hủy (24) hoặc lỗi khác
    const failedStatus: PaymentStatus = responseCode === '24' ? 'cancelled' : 'failed';
    await this.paymentRepository.updateStatus(payment.code, failedStatus, transactionNo);
    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /**
   * Xử lý Return URL khi trình duyệt khách hàng chuyển hướng về từ cổng VNPay
   */
  public async processReturn(query: Record<string, unknown>): Promise<ProcessReturnResult> {
    const isValid = this.vnpayGateway.verifySignature(query, env.vnpayHashSecret);
    if (!isValid) {
      return {
        success: false,
        status: 'invalid_checksum',
        message: 'Chữ ký xác thực không hợp lệ (Checksum failed).',
      };
    }

    const txnRef = String(query.vnp_TxnRef || '');
    const payment = await this.paymentRepository.findByCode(txnRef);
    if (!payment) {
      return {
        success: false,
        status: 'not_found',
        message: 'Không tìm thấy thông tin giao dịch nạp tiền.',
      };
    }

    const responseCode = String(query.vnp_ResponseCode || '');
    const transactionStatus = String(query.vnp_TransactionStatus || '');
    const transactionNo = String(query.vnp_TransactionNo || '');

    if (responseCode === '00' && transactionStatus === '00') {
      // Nếu chưa được IPN cộng tiền thì cộng tiền ngay tại đây
      if (payment.status === 'pending') {
        await this.ledgerService.recordSingleEntry({
          walletId: payment.orderId,
          postingKey: `topup_vnpay_${payment.code}`,
          amount: payment.amount,
          type: 'credit',
          reference: {
            kind: 'payment',
            id: payment._id,
          },
          description: `Nạp tiền ví qua VNPay (${payment.code})`,
        });

        await this.paymentRepository.updateStatus(payment.code, 'success', transactionNo);
      }

      return {
        success: true,
        status: 'success',
        paymentCode: payment.code,
        amount: payment.amount,
        message: 'Nạp tiền vào ví thành công.',
      };
    }

    const failedStatus: PaymentStatus = responseCode === '24' ? 'cancelled' : 'failed';
    if (payment.status === 'pending') {
      await this.paymentRepository.updateStatus(payment.code, failedStatus, transactionNo);
    }

    return {
      success: false,
      status: failedStatus,
      paymentCode: payment.code,
      amount: payment.amount,
      message:
        responseCode === '24'
          ? 'Giao dịch nạp tiền đã bị hủy bởi người dùng.'
          : 'Giao dịch nạp tiền thất bại.',
    };
  }

  /**
   * Tra cứu thông tin trạng thái giao dịch
   */
  public async getPaymentByCode(code: string): Promise<IPayment | null> {
    return this.paymentRepository.findByCode(code);
  }
}
