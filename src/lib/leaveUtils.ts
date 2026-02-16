import { addDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { formatDateForDB } from "@/lib/dateUtils";

/**
 * Fetches approved personal leave dates for a user within the given date range.
 * Used to exclude tasks on leave days from completion % calculations (e.g. useTeamCompletionStats).
 */
export async function fetchLeaveDatesForUser(
  userId: string,
  start: Date,
  end: Date,
  timezone: string = "Asia/Kolkata"
): Promise<Set<string>> {
  const { data: personalHolidayData, error } = await supabase
    .from("personal_holidays")
    .select("start_date, end_date")
    .eq("user_id", userId)
    .eq("approval_status", "approved");

  if (error) {
    console.error("Error fetching leave dates:", error);
    return new Set();
  }

  const result = new Set<string>();
  if (!personalHolidayData || personalHolidayData.length === 0) {
    return result;
  }

  for (const holiday of personalHolidayData) {
    const hStart = parseISO(holiday.start_date);
    const hEnd = parseISO(holiday.end_date);
    const overlapStart = start > hStart ? start : hStart;
    const overlapEnd = end < hEnd ? end : hEnd;
    if (overlapStart <= overlapEnd) {
      let d = new Date(overlapStart);
      while (d <= overlapEnd) {
        result.add(formatDateForDB(d, timezone));
        d = addDays(d, 1);
      }
    }
  }

  return result;
}
