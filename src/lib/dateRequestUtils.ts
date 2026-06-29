import { isWeekend, addBusinessDays, isBefore, startOfDay } from 'date-fns';

/**
 * Gets the minimum valid date for a new date request (2 business days from today)
 */
export function getMinimumRequestDate(): Date {
  return addBusinessDays(startOfDay(new Date()), 2);
}

/**
 * Checks if a date is a valid request date (weekday and at least 2 business days away)
 */
export function isValidRequestDate(date: Date): boolean {
  // Must be a weekday
  if (isWeekend(date)) return false;
  
  // Must be at least 2 business days away
  const minDate = getMinimumRequestDate();
  return !isBefore(startOfDay(date), minDate);
}

/**
 * Gets dates that should be disabled in the calendar
 * Returns a matcher function for react-day-picker
 */
export function getDisabledDates(): (date: Date) => boolean {
  const minDate = getMinimumRequestDate();
  
  return (date: Date) => {
    // Disable weekends
    if (isWeekend(date)) return true;
    
    // Disable dates before minimum request date
    if (isBefore(startOfDay(date), minDate)) return true;
    
    return false;
  };
}
