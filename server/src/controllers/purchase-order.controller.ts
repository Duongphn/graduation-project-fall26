import { type NextFunction, type Request, type Response } from 'express';
import { type PurchaseOrderService } from '../services/purchase-order.service.js';
import {
  confirmReceivedSchema,
  confirmShippingSchema,
  createBuyNowSchema,
  quotePurchasePricingSchema,
} from '../validations/purchase-order.validation.js';

export class PurchaseOrderController {
  public constructor(private readonly service: PurchaseOrderService) {}

  public quote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = quotePurchasePricingSchema.parse(req.body);
      const quote = await this.service.quotePricing(input);
      res.status(200).json({ success: true, data: quote });
    } catch (err) {
      next(err);
    }
  };

  public buyNow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.auth!;
      const input = createBuyNowSchema.parse(req.body);
      const order = await this.service.buyNow(actor, input);
      res.status(201).json({
        success: true,
        message: 'Thanh toán mua hàng thành công vào Escrow.',
        data: order,
      });
    } catch (err) {
      next(err);
    }
  };

  public ship = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.auth!;
      const orderId = String(req.params.orderId ?? '');
      const input = confirmShippingSchema.parse(req.body);
      const order = await this.service.confirmShipping(actor, orderId, input);
      res.status(200).json({
        success: true,
        message: 'Xác nhận gửi hàng thành công.',
        data: order,
      });
    } catch (err) {
      next(err);
    }
  };

  public receive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.auth!;
      const orderId = String(req.params.orderId ?? '');
      // Vẫn kiểm tra body (ghi chú ≤ 500 ký tự) để API không đổi; ghi chú hiện chưa được lưu
      confirmReceivedSchema.parse(req.body ?? {});
      const order = await this.service.confirmReceived(actor, orderId);
      res.status(200).json({
        success: true,
        message: 'Xác nhận đã nhận hàng thành công. Tiền đã được quyết toán cho người bán.',
        data: order,
      });
    } catch (err) {
      next(err);
    }
  };

  public getDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.auth!;
      const orderId = String(req.params.orderId ?? '');
      const order = await this.service.getOrderDetail(actor, orderId);
      res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  };

  public listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.auth!;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await this.service.listMyPurchases(actor, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  public listSold = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = req.auth!;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await this.service.listMySales(actor, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
