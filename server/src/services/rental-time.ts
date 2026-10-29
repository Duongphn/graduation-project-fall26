import { type RentalPeriod, type RentalSettings } from '../types/rental-order.types.js';
import { AppError } from '../utils/app-error.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const VN_OFFSET_HOURS = 7;

/**
 * Parse a strict YYYY-MM-DD string into a Date at UTC midnight.
 */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Format a Date as YYYY-MM-DD using UTC components.
 */
export function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate the Vietnam calendar date of `now` at UTC midnight.
 */
export function vnToday(now: Date): Date {
  const vnTime = new Date(now.getTime() + VN_OFFSET_HOURS * HOUR_MS);
  return new Date(Date.UTC(vnTime.getUTCFullYear(), vnTime.getUTCMonth(), vnTime.getUTCDate()));
}

/**
 * 00:00 VN time on startDate (stored as UTC midnight).
 */
export function startOfRental(startDate: Date): Date {
  return new Date(startDate.getTime() - VN_OFFSET_HOURS * HOUR_MS);
}

/**
 * 00:00 VN time on the day after endDate.
 */
export function rentalEnd(endDate: Date): Date {
  return new Date(endDate.getTime() + (24 - VN_OFFSET_HOURS) * HOUR_MS);
}

/**
 * Inclusive number of rental days: endDate - startDate + 1.
 */
export function inclusiveDays(period: RentalPeriod): number {
  const diff = Math.round((period.endDate.getTime() - period.startDate.getTime()) / DAY_MS);
  return diff + 1;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

/**
 * Validates dates per business rules.
 */
export function assertBookablePeriod(
  period: RentalPeriod,
  now: Date,
  settings: RentalSettings,
): void {
  const today = vnToday(now);

  if (period.startDate.getTime() < today.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ngày bắt đầu phải từ hôm nay trở đi (today or later)');
  }

  if (period.endDate.getTime() < period.startDate.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ngày kết thúc không được trước ngày bắt đầu');
  }

  const days = inclusiveDays(period);
  if (days > settings.maxDays) {
    throw new AppError(400, 'VALIDATION_ERROR', `Thời gian thuê tối đa là ${settings.maxDays} ngày`);
  }

  const maxBookingDate = new Date(today.getTime() + (settings.bookingWindowDays - 1) * DAY_MS);
  if (period.endDate.getTime() > maxBookingDate.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', `Ngày thuê vượt quá giới hạn đặt trước (${settings.bookingWindowDays} ngày)`);
  }
}

/**
 * Suggests earliest free range of `days` length between windowStart and windowEnd.
 */
export function suggestFreeRange(
  occupied: RentalPeriod[],
  days: number,
  windowStart: Date,
  windowEnd: Date,
): RentalPeriod | null {
  const sortedOccupied = [...occupied].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const candidateStarts: Date[] = [windowStart];

  for (const occ of sortedOccupied) {
    candidateStarts.push(new Date(occ.endDate.getTime() + DAY_MS));
  }

  candidateStarts.sort((a, b) => a.getTime() - b.getTime());

  for (const start of candidateStarts) {
    if (start.getTime() < windowStart.getTime()) {
      continue;
    }
    const end = new Date(start.getTime() + (days - 1) * DAY_MS);
    if (end.getTime() > windowEnd.getTime()) {
      continue;
    }

    const hasOverlap = sortedOccupied.some(
      (occ) => start.getTime() <= occ.endDate.getTime() && end.getTime() >= occ.startDate.getTime(),
    );

    if (!hasOverlap) {
      return { startDate: start, endDate: end };
    }
  }

  return null;
}

/**
 * 00:00 VN time on the day after startDate. Hạn phản hồi/thanh toán không vượt quá mốc này,
 * nên đơn đặt trong ngày vẫn còn thời gian đến hết ngày bắt đầu.
 */
export function endOfStartDay(startDate: Date): Date {
  return addHours(startOfRental(startDate), 24);
}

export function ownerResponseDue(createdAt: Date, startDate: Date, s: RentalSettings): Date {
  const normalDue = addHours(createdAt, s.ownerResponseHours);
  return new Date(Math.min(normalDue.getTime(), endOfStartDay(startDate).getTime()));
}

export function paymentDue(acceptedAt: Date, startDate: Date, s: RentalSettings): Date {
  const normalDue = addHours(acceptedAt, s.paymentHours);
  return new Date(Math.min(normalDue.getTime(), endOfStartDay(startDate).getTime()));
}

/**
 * Mốc nhắc quá hạn kế tiếp: `from` cộng từng bước 24h cho đến khi sau `now`,
 * để server ngừng chạy hay nhận đồ trễ không tạo ra một loạt nhắc dồn.
 */
export function nextOverdueReminder(from: Date, now: Date): Date {
  if (from.getTime() > now.getTime()) {
    return from;
  }
  const steps = Math.floor((now.getTime() - from.getTime()) / DAY_MS) + 1;
  return new Date(from.getTime() + steps * DAY_MS);
}

export function receiptDue(shippedAt: Date, s: RentalSettings): Date {
  return addHours(shippedAt, s.receiptAutoConfirmHours);
}

export function returnReminderDue(endDate: Date, now: Date, s: RentalSettings): Date {
  const reminderTime = new Date(rentalEnd(endDate).getTime() - s.returnReminderHours * HOUR_MS);
  return reminderTime.getTime() > now.getTime() ? reminderTime : now;
}

export function settlementDue(requestedAt: Date, s: RentalSettings): Date {
  return addHours(requestedAt, s.settlementHours);
}
