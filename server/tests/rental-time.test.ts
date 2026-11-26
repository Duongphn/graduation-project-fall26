import { describe, expect, it } from 'vitest';
import {
  addHours,
  assertBookablePeriod,
  formatDateOnly,
  inclusiveDays,
  ownerResponseDue,
  parseDateOnly,
  paymentDue,
  rentalEnd,
  returnReminderDue,
  startOfRental,
  suggestFreeRange,
  vnToday,
} from '../src/services/rental-time.js';
import { DEFAULT_RENTAL_SETTINGS } from '../src/types/rental-order.types.js';

describe('rental-time', () => {
  const d = (s: string) => parseDateOnly(s)!;

  it('parses strict dates', () => {
    expect(parseDateOnly('2026-11-05')?.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-1-5')).toBeNull();
    expect(parseDateOnly(20261105)).toBeNull();
  });

  it('uses the VN calendar day', () => {
    expect(formatDateOnly(vnToday(new Date('2026-11-01T16:59:00Z')))).toBe('2026-11-01');
    expect(formatDateOnly(vnToday(new Date('2026-11-01T17:30:00Z')))).toBe('2026-11-02');
  });

  it('computes rental boundaries', () => {
    expect(startOfRental(d('2026-11-05')).toISOString()).toBe('2026-11-04T17:00:00.000Z');
    expect(rentalEnd(d('2026-11-07')).toISOString()).toBe('2026-11-07T17:00:00.000Z');
    expect(inclusiveDays({ startDate: d('2026-11-05'), endDate: d('2026-11-07') })).toBe(3);
    expect(addHours(new Date('2026-11-01T00:00:00.000Z'), 5).toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });

  it('rejects unbookable periods', () => {
    const now = new Date('2026-11-01T03:00:00Z');
    const s = DEFAULT_RENTAL_SETTINGS;
    expect(() => assertBookablePeriod({ startDate: d('2026-10-31'), endDate: d('2026-11-02') }, now, s)).toThrow(/VALIDATION|past|today/i);
    expect(() => assertBookablePeriod({ startDate: d('2026-11-05'), endDate: d('2026-11-04') }, now, s)).toThrow();
    expect(() => assertBookablePeriod({ startDate: d('2026-11-02'), endDate: d('2026-12-02') }, now, s)).toThrow(); // 31 days
    expect(() => assertBookablePeriod({ startDate: d('2027-04-29'), endDate: d('2027-04-30') }, now, s)).toThrow(); // beyond 180-day window
    expect(() => assertBookablePeriod({ startDate: d('2026-11-01'), endDate: d('2026-11-30') }, now, s)).not.toThrow();
    expect(() => assertBookablePeriod({ startDate: d('2026-11-03'), endDate: d('2026-11-03') }, now, s)).toThrow(/từ 2 đến 30 ngày/); // 1 day
    expect(() => assertBookablePeriod({ startDate: d('2026-11-03'), endDate: d('2026-11-04') }, now, s)).not.toThrow(); // 2 days
  });

  it('caps deadlines at the end of the start day', () => {
    const s = DEFAULT_RENTAL_SETTINGS;
    expect(ownerResponseDue(new Date('2026-11-01T03:00:00Z'), d('2026-11-05'), s).toISOString()).toBe('2026-11-02T03:00:00.000Z');
    expect(ownerResponseDue(new Date('2026-11-01T03:00:00Z'), d('2026-11-02'), s).toISOString()).toBe('2026-11-02T03:00:00.000Z');
    // Đặt trong ngày: hạn là 00:00 VN ngày hôm sau, không rơi vào quá khứ
    expect(ownerResponseDue(new Date('2026-11-01T03:00:00Z'), d('2026-11-01'), s).toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(paymentDue(new Date('2026-11-01T03:00:00Z'), d('2026-11-05'), s).toISOString()).toBe('2026-11-01T15:00:00.000Z');
    expect(paymentDue(new Date('2026-11-01T10:00:00Z'), d('2026-11-01'), s).toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(returnReminderDue(d('2026-11-07'), new Date('2026-11-01T00:00:00Z'), s).toISOString()).toBe('2026-11-06T17:00:00.000Z');
    const late = new Date('2026-11-07T10:00:00Z');
    expect(returnReminderDue(d('2026-11-07'), late, s)).toEqual(late);
  });

  it('suggests the earliest free range of the same length', () => {
    const occupied = [{ startDate: d('2026-11-05'), endDate: d('2026-11-07') }];
    expect(suggestFreeRange(occupied, 3, d('2026-11-04'), d('2027-04-29'))).toEqual({ startDate: d('2026-11-08'), endDate: d('2026-11-10') });
    expect(suggestFreeRange(occupied, 1, d('2026-11-04'), d('2027-04-29'))).toEqual({ startDate: d('2026-11-04'), endDate: d('2026-11-04') });
    expect(suggestFreeRange(occupied, 3, d('2026-11-05'), d('2026-11-09'))).toBeNull();
  });

  // Review 20/11, rental bug 8: chose 28–29/11 (taken) on 20/11 and was offered 20–21/11.
  it('suggests the free range closest to the dates the renter chose', () => {
    const window = [d('2026-11-20'), d('2027-05-18')] as const;
    const taken = [{ startDate: d('2026-11-28'), endDate: d('2026-11-29') }];
    // 26–27 and 30/11–01/12 are both two days away: the later one wins
    expect(suggestFreeRange(taken, 2, ...window, d('2026-11-28'))).toEqual({ startDate: d('2026-11-30'), endDate: d('2026-12-01') });
    // Chose 27–28: ending right before the booking (26–27) is closer than after it (30/11–01/12)
    expect(suggestFreeRange(taken, 2, ...window, d('2026-11-27'))).toEqual({ startDate: d('2026-11-26'), endDate: d('2026-11-27') });
    // Several bookings: skips the busy stretch to the nearest gap long enough
    const busy = [
      { startDate: d('2026-12-01'), endDate: d('2026-12-05') },
      { startDate: d('2026-12-08'), endDate: d('2026-12-12') },
    ];
    expect(suggestFreeRange(busy, 3, ...window, d('2026-12-04'))).toEqual({ startDate: d('2026-11-28'), endDate: d('2026-11-30') });
    expect(suggestFreeRange(busy, 2, ...window, d('2026-12-04'))).toEqual({ startDate: d('2026-12-06'), endDate: d('2026-12-07') });
    // Never before the window (today)
    expect(suggestFreeRange([{ startDate: d('2026-11-20'), endDate: d('2026-11-22') }], 2, ...window, d('2026-11-20'))).toEqual({ startDate: d('2026-11-23'), endDate: d('2026-11-24') });
  });
});
