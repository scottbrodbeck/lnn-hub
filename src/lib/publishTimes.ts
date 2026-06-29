import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE } from '@/lib/editTimeUtils';

// Standard sponsored-post publishing times (US Eastern)
export const STANDARD_PUBLISH_TIMES = [
  { hour: 10, minute: 45 },
  { hour: 12, minute: 45 },
  { hour: 16, minute: 45 },
] as const;

/**
 * Build the UTC instant for hh:mm ET on *today's ET calendar date*.
 * Uses the ET calendar day (not the browser's) so chips are correct for
 * admins in any timezone — same fix as getCutoffInstant in editTimeUtils.
 */
export function getTodayEtInstant(hour: number, minute: number): Date {
  const ymd = formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return fromZonedTime(`${ymd}T${hh}:${mm}:00`, TIMEZONE);
}

export function isPastEt(instant: Date): boolean {
  return instant.getTime() <= Date.now();
}

export function formatEtTime(instant: Date): string {
  return formatInTimeZone(instant, TIMEZONE, 'h:mm a');
}
