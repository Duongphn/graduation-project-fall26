import { type Clock } from '../interfaces/rental-order.ports.js';
import { type RentalOrderRepository } from '../repositories/rental-order.repository.js';
import { type RentalSystemService } from './rental-system.service.js';

export class RentalTimerService {
  public constructor(
    private readonly rentals: RentalSystemService,
    private readonly repository: RentalOrderRepository,
    private readonly clock: Clock,
    private readonly logger: Pick<Console, 'error'> = console,
  ) {}

  public async runDue(): Promise<{ processed: number; failed: number }> {
    const now = this.clock.now();
    const dues = await this.repository.findDue(now, 100);
    let processed = 0;
    let failed = 0;

    for (const item of dues) {
      try {
        switch (item.kind) {
          case 'OWNER_RESPONSE':
            await this.rentals.expire(item.id, 'OWNER_RESPONSE');
            break;
          case 'PAYMENT':
            await this.rentals.expire(item.id, 'PAYMENT');
            break;
          case 'RECEIPT_CONFIRM':
            await this.rentals.autoConfirmReceipt(item.id);
            break;
          case 'RETURN_REMINDER':
            await this.rentals.remindReturn(item.id);
            break;
          case 'OVERDUE':
            await this.rentals.remindOverdue(item.id);
            break;
          case 'SETTLEMENT':
            await this.rentals.autoSettle(item.id);
            break;
        }
        processed += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(`Failed to process timer ${item.kind} for order ${item.id}:`, err);
      }
    }

    return { processed, failed };
  }
}

export function startRentalScheduler(
  timer: RentalTimerService,
  intervalMs = 60_000,
): () => void {
  let isRunning = false;

  const intervalId = setInterval(async () => {
    if (isRunning) {
      return;
    }
    isRunning = true;
    try {
      await timer.runDue();
    } catch {
      // Swallows timer tick error
    } finally {
      isRunning = false;
    }
  }, intervalMs);

  return () => {
    clearInterval(intervalId);
  };
}
