// Viet Nam has one time zone (UTC+7) and no daylight saving time.
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

const vietnamDateParts = (date: Date) => {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
};

/** Full years between the date of birth and `now`, counted on the calendar in Viet Nam. */
export const ageInYears = (dateOfBirth: Date, now: Date = new Date()): number => {
  const birth = vietnamDateParts(dateOfBirth);
  const today = vietnamDateParts(now);
  const hadBirthday =
    today.month > birth.month || (today.month === birth.month && today.day >= birth.day);
  return today.year - birth.year - (hadBirthday ? 0 : 1);
};

/** ISO string for a response DTO, or null. */
export const toIsoString = (date: Date | null | undefined): string | null =>
  date ? date.toISOString() : null;
