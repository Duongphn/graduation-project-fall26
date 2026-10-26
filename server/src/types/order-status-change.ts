import type { ActorReference } from './actor.js';

export const orderTypes = ['RENTAL', 'RESALE', 'DONATION'] as const;

export type OrderType = (typeof orderTypes)[number];

export interface OrderStatusChange {
  orderType: OrderType;
  orderId: string;
  status: string;
  updatedBy: ActorReference;
  occurredAt: Date;
  reason?: string;
  note?: string;
}
