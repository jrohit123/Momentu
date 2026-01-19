import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Formats a date for database storage in the specified timezone.
 * Converts the date to the given timezone (defaults to 'Asia/Kolkata' for IST)
 * and formats it as 'yyyy-MM-dd' string.
 * 
 * @param date - The date to format
 * @param timezone - The timezone to convert to (defaults to 'Asia/Kolkata')
 * @returns Formatted date string in 'yyyy-MM-dd' format
 * 
 * @example
 * const date = new Date('2024-01-15T18:30:00Z'); // UTC
 * formatDateForDB(date, 'Asia/Kolkata'); // Returns '2024-01-16' (IST is UTC+5:30)
 */
export function formatDateForDB(date: Date, timezone: string = "Asia/Kolkata"): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error("Invalid date provided to formatDateForDB");
  }
  
  // Convert date to the specified timezone and format as yyyy-MM-dd
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}
