import { parseISO } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export const CUTOFF_HOUR = 10;
export const CUTOFF_MINUTE = 30;
export const TIMEZONE = 'America/New_York'; // Eastern Time

/**
 * Build the 10:30 AM ET cutoff for a given publication date as a real UTC
 * instant. This is correct regardless of the browser's local timezone — the
 * older implementation mixed `toZonedTime` (UTC-fields-as-wall-time) with
 * `setHours`/`setMinutes` (local-fields), which produced an off-by-N-hours
 * cutoff for any browser outside ET.
 */
function getCutoffInstant(publicationDate: string | Date): Date {
  const pub =
    typeof publicationDate === 'string' ? parseISO(publicationDate) : publicationDate;
  // Calendar date (YYYY-MM-DD) of the publication day *in ET*
  const ymd = formatInTimeZone(pub, TIMEZONE, 'yyyy-MM-dd');
  const hh = String(CUTOFF_HOUR).padStart(2, '0');
  const mm = String(CUTOFF_MINUTE).padStart(2, '0');
  // 10:30:00 on that ET calendar day, converted to a real UTC instant
  return fromZonedTime(`${ymd}T${hh}:${mm}:00`, TIMEZONE);
}

/**
 * Check if edits are allowed without admin review
 * @param publicationDate - The due_date from assignment
 * @returns true if edits are allowed, false if review required
 */
export function canEditWithoutReview(publicationDate: string | Date): boolean {
  return Date.now() < getCutoffInstant(publicationDate).getTime();
}

/**
 * Get time remaining until cutoff
 */
export function getTimeUntilCutoff(publicationDate: string | Date): {
  hours: number;
  minutes: number;
  isPast: boolean;
} {
  const diffMs = getCutoffInstant(publicationDate).getTime() - Date.now();
  const isPast = diffMs < 0;
  const abs = Math.abs(diffMs);
  return {
    hours: Math.floor(abs / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    isPast,
  };
}
