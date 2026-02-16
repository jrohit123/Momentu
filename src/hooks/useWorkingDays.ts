import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, isWithinInterval, parseISO } from "date-fns";
import { useSystemSettings } from "./useSystemSettings";
import { formatDateForDB } from "@/lib/dateUtils";

interface WorkingDayInfo {
  isWorkingDay: boolean;
  reason?: string;
  loading: boolean;
}

/**
 * Hook to check if a date is a working day
 * A working day is NOT: (1) weekly off, (2) public holiday, or (3) personal holiday
 */
export const useWorkingDays = (userId: string) => {
  const [weeklyOffs, setWeeklyOffs] = useState<string[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<Set<string>>(new Set());
  const [personalHolidays, setPersonalHolidays] = useState<Array<{ start: string; end: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { settings } = useSystemSettings(organizationId);

  useEffect(() => {
    const fetchOrganizationId = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("organization_id")
          .eq("id", userId)
          .maybeSingle();

        if (error) throw error;
        setOrganizationId(data?.organization_id || null);
      } catch (error) {
        console.error("Error fetching organization ID:", error);
      }
    };

    fetchOrganizationId();
  }, [userId]);

  useEffect(() => {
    const fetchWorkingDayData = async () => {
      try {
        // First, try to fetch user-specific weekly offs
        const { data: userWeeklyOffData } = await supabase
          .from("user_weekly_offs")
          .select("day_of_week")
          .eq("user_id", userId);
        
        if (userWeeklyOffData && userWeeklyOffData.length > 0) {
          // User has specific weekly offs set
          setWeeklyOffs(userWeeklyOffData.map(w => w.day_of_week));
        } else {
          // Fall back to organization-wide weekly offs
          const { data: weeklyOffData } = await supabase
            .from("weekly_offs")
            .select("day_of_week");
          
          if (weeklyOffData) {
            setWeeklyOffs(weeklyOffData.map(w => w.day_of_week));
          }
        }

        // Fetch public holidays
        const { data: publicHolidayData } = await supabase
          .from("public_holidays")
          .select("holiday_date");
        
        if (publicHolidayData) {
          setPublicHolidays(new Set(publicHolidayData.map(h => h.holiday_date)));
        }

        // Fetch personal holidays for the user
        const { data: personalHolidayData } = await supabase
          .from("personal_holidays")
          .select("start_date, end_date")
          .eq("user_id", userId)
          .eq("approval_status", "approved");
        
        if (personalHolidayData) {
          setPersonalHolidays(personalHolidayData.map(h => ({ 
            start: h.start_date, 
            end: h.end_date 
          })));
        }
      } catch (error) {
        console.error("Error fetching working day data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      fetchWorkingDayData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, organizationId]);

  const isWorkingDay = (date: Date): WorkingDayInfo => {
    if (loading) {
      return { isWorkingDay: true, loading: true };
    }

    // Check weekly off
    const dayName = format(date, "EEEE").toLowerCase();
    if (weeklyOffs.includes(dayName)) {
      return { isWorkingDay: false, reason: "Weekly Off", loading: false };
    }

    // Check public holiday
    const dateStr = formatDateForDB(date, settings.timezone);
    if (publicHolidays.has(dateStr)) {
      return { isWorkingDay: false, reason: "Public Holiday", loading: false };
    }

    // Check personal holiday
    for (const holiday of personalHolidays) {
      const start = parseISO(holiday.start);
      const end = parseISO(holiday.end);
      if (isWithinInterval(date, { start, end })) {
        return { isWorkingDay: false, reason: "Personal Holiday", loading: false };
      }
    }

    return { isWorkingDay: true, loading: false };
  };

  const getNextWorkingDay = (date: Date): Date => {
    let current = new Date(date);
    current.setDate(current.getDate() + 1);
    
    let attempts = 0;
    while (!isWorkingDay(current).isWorkingDay && attempts < 365) {
      current.setDate(current.getDate() + 1);
      attempts++;
    }
    
    return current;
  };

  /**
   * Returns a Set of date strings (YYYY-MM-DD) when the user is on approved personal leave
   * within the given range. Used to exclude tasks on leave days from completion % calculations.
   */
  const getLeaveDatesInRange = (start: Date, end: Date): Set<string> => {
    const result = new Set<string>();
    for (const holiday of personalHolidays) {
      const hStart = parseISO(holiday.start);
      const hEnd = parseISO(holiday.end);
      const overlapStart = start > hStart ? start : hStart;
      const overlapEnd = end < hEnd ? end : hEnd;
      if (overlapStart <= overlapEnd) {
        let d = new Date(overlapStart);
        while (d <= overlapEnd) {
          result.add(formatDateForDB(d, settings.timezone));
          d = addDays(d, 1);
        }
      }
    }
    return result;
  };

  /**
   * Returns true if the date falls within an approved personal leave (holiday).
   * Used to exclude tasks on leave days from completion % calculations.
   */
  const isOnPersonalLeave = (date: Date): boolean => {
    if (loading) return false;
    const dateStr = formatDateForDB(date, settings.timezone);
    return getLeaveDatesInRange(date, date).has(dateStr);
  };

  return { isWorkingDay, getNextWorkingDay, isOnPersonalLeave, getLeaveDatesInRange, loading };
};
