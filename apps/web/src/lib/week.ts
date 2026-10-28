const DAY_MS = 86_400_000;
const weekKeyPattern = /^(\d{4})-W(\d{2})$/;

/** The ISO week (Monday start) a local calendar date falls in, as `YYYY-Www`. */
export function isoWeekKey(date: Date): string {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (new Date(day).getUTCDay() + 6) % 7;
  const thursday = new Date(day - weekday * DAY_MS + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday of the week as a UTC date, or null for a malformed key. */
export function weekMonday(weekKey: string): Date | null {
  const match = weekKeyPattern.exec(weekKey);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const jan4 = Date.UTC(year, 0, 4);
  const firstMonday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(firstMonday + (Number(match[2]) - 1) * 7 * DAY_MS);
}

export function shiftWeek(weekKey: string, weeks: number): string {
  const monday = weekMonday(weekKey);
  if (!monday) {
    return weekKey;
  }
  const shifted = new Date(monday.getTime() + weeks * 7 * DAY_MS);
  return isoWeekKey(
    new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "27 Oct – 2 Nov" for the week's Monday to Sunday. */
export function weekRange(weekKey: string): string {
  const monday = weekMonday(weekKey);
  if (!monday) {
    return '';
  }
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const format = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${format(monday)} – ${format(sunday)}`;
}
