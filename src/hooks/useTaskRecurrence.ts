import { useMemo } from "react";
import { RRule, Frequency } from "rrule";
import { startOfDay, endOfDay, isSameDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

interface RecurrenceConfig {
  frequency?: string;
  interval?: number;
  days?: number[]; // For weekly recurrence (0=Sunday, 1=Monday, etc.)
  byweekday?: number[];
  bymonthday?: number[];
  bymonth?: number[]; // For yearly recurrence (0=January, 1=February, etc.)
  bysetpos?: number[];
  monthlyType?: "date" | "weekday";
  yearlyType?: "date" | "weekday";
  dayOfMonth?: number;
  until?: string;
  count?: number;
  endType?: string;
  endDate?: string;
  occurrences?: number;
}

interface Task {
  id: string;
  recurrence_type: string;
  recurrence_config: RecurrenceConfig | null;
  created_at: string;
}

/**
 * Hook to expand task recurrence patterns and check if a task applies to a specific date
 */
export const useTaskRecurrence = () => {
  const getFrequency = (type: string, config?: RecurrenceConfig): Frequency => {
    // For custom recurrence, get frequency from config
    if (type === "custom" && config?.frequency) {
      switch (config.frequency) {
        case "daily":
          return RRule.DAILY;
        case "weekly":
          return RRule.WEEKLY;
        case "monthly":
          return RRule.MONTHLY;
        case "yearly":
          return RRule.YEARLY;
        default:
          return RRule.DAILY;
      }
    }
    
    // For standard recurrence types
    switch (type) {
      case "daily":
        return RRule.DAILY;
      case "weekly":
        return RRule.WEEKLY;
      case "monthly":
        return RRule.MONTHLY;
      case "yearly":
        return RRule.YEARLY;
      default:
        return RRule.DAILY;
    }
  };

  const taskAppliesToDate = useMemo(() => {
    return (task: Task, targetDate: Date): boolean => {
      // One-time tasks (no recurrence)
      if (task.recurrence_type === "none") {
        return isSameDay(new Date(task.created_at), targetDate);
      }

      // For custom recurrence, require recurrence_config
      if (task.recurrence_type === "custom" && !task.recurrence_config) {
        return false;
      }

      // For simple recurrence types (daily, weekly, monthly, yearly), 
      // create a default config if one doesn't exist
      const config = task.recurrence_config || { interval: 1 };

      try {
        // Create dtstart using IST timezone (default organization timezone)
        // Parse the created_at date and extract date components in IST
        // This ensures tasks start on the correct local date, not UTC date
        const createdDate = new Date(task.created_at);
        const istTimezone = "Asia/Kolkata";
        
        // Extract date components in IST timezone
        const istDateStr = formatInTimeZone(createdDate, istTimezone, "yyyy-MM-dd");
        
        // Create a date representing midnight IST on the creation date
        // Use toDate to convert the IST date string to a Date object
        // Format: "yyyy-MM-ddTHH:mm:ss" where the time represents IST
        const istMidnightStr = `${istDateStr}T00:00:00+05:30`; // IST is UTC+5:30
        const dtstart = new Date(istMidnightStr);
        
        // Build RRule options
        const options: any = {
          freq: getFrequency(task.recurrence_type, config),
          dtstart,
          interval: config.interval || 1,
        };

        // Add end condition
        if (config.endType === "on" && config.endDate) {
          options.until = endOfDay(new Date(config.endDate));
        } else if (config.endType === "after" && config.occurrences) {
          options.count = config.occurrences;
        } else if (config.until) {
          // Legacy support
          options.until = endOfDay(new Date(config.until));
        } else if (config.count) {
          // Legacy support
          options.count = config.count;
        }

        // Determine the effective recurrence type (for custom, use frequency from config)
        const effectiveType = task.recurrence_type === "custom" 
          ? (config.frequency || "daily")
          : task.recurrence_type;

        // RRule weekday mapping: Our system (0=Sunday) -> RRule (0=Monday)
        const rruleWeekdayMap = [6, 0, 1, 2, 3, 4, 5]; // Maps our day index to RRule weekday

        // Handle yearly recurrence
        if (effectiveType === "yearly" || (task.recurrence_type === "custom" && config.frequency === "yearly")) {
          if (config.yearlyType === "weekday" && config.bysetpos && config.byweekday && config.bymonth) {
            // Yearly relative pattern (e.g., "First Monday of January")
            options.bysetpos = config.bysetpos;
            options.byweekday = config.byweekday.map((day: number) => rruleWeekdayMap[day]);
            // RRule uses 1-12 for months, our system uses 0-11
            options.bymonth = config.bymonth.map((month: number) => month + 1);
          } else if (config.yearlyType === "date" && config.dayOfMonth && config.bymonth) {
            // Yearly by date (e.g., "January 15")
            options.bymonthday = [config.dayOfMonth];
            // RRule uses 1-12 for months, our system uses 0-11
            options.bymonth = config.bymonth.map((month: number) => month + 1);
          } else if (config.bymonth && config.bymonthday) {
            // Legacy support for yearly by date
            options.bymonth = config.bymonth.map((month: number) => month + 1);
            options.bymonthday = config.bymonthday;
          } else if (config.bymonth) {
            // Just month specified
            options.bymonth = config.bymonth.map((month: number) => month + 1);
          }
        }
        // Handle monthly recurrence
        else if (effectiveType === "monthly" || (task.recurrence_type === "custom" && config.frequency === "monthly")) {
          if (config.monthlyType === "weekday" && config.bysetpos && config.byweekday) {
            // Monthly relative pattern (e.g., "First Monday", "Last Friday")
            options.bysetpos = config.bysetpos;
            options.byweekday = config.byweekday.map((day: number) => rruleWeekdayMap[day]);
          } else if (config.monthlyType === "date" && config.dayOfMonth) {
            // Monthly by day of month (e.g., "On day 15")
            options.bymonthday = [config.dayOfMonth];
          } else if (config.bymonthday && config.bymonthday.length > 0) {
            // Legacy support
            options.bymonthday = config.bymonthday;
          }
        }
        // Handle weekly recurrence
        else if (effectiveType === "weekly" || (task.recurrence_type === "custom" && config.frequency === "weekly")) {
          const weekdays = config.days || config.byweekday || [];
          if (weekdays.length > 0) {
            // Convert day numbers (0=Sunday, 1=Monday, etc.) to RRule weekdays
            options.byweekday = weekdays.map((day: number) => rruleWeekdayMap[day]);
          }
        }
        // Handle other recurrence types that might have byweekday or bymonthday
        else {
          if (config.byweekday && config.byweekday.length > 0) {
            options.byweekday = config.byweekday;
          }
          if (config.bymonthday && config.bymonthday.length > 0) {
            options.bymonthday = config.bymonthday;
          }
          if (config.bymonth && config.bymonth.length > 0) {
            options.bymonth = config.bymonth.map((month: number) => month + 1);
          }
        }

        const rule = new RRule(options);
        
        // Check if target date matches any occurrence
        // Normalize target date to IST first, then convert to UTC for RRule
        const targetDateISTStr = formatInTimeZone(targetDate, istTimezone, "yyyy-MM-dd");
        
        // Create UTC dates for RRule.between() using IST date components
        // Use ISO 8601 format with timezone offset (IST is UTC+5:30)
        const targetStartIST = `${targetDateISTStr}T00:00:00+05:30`;
        const targetStart = new Date(targetStartIST);
        const targetEndIST = `${targetDateISTStr}T23:59:59+05:30`;
        const targetEnd = new Date(targetEndIST);
        
        const occurrences = rule.between(targetStart, targetEnd, true);
        
        // Check if any occurrence falls on the target date (compare by IST date components)
        return occurrences.some(occurrence => {
          const occDate = new Date(occurrence);
          const occDateISTStr = formatInTimeZone(occDate, istTimezone, "yyyy-MM-dd");
          return occDateISTStr === targetDateISTStr;
        });
      } catch (error) {
        console.error("Error processing recurrence:", error);
        return false;
      }
    };
  }, []);

  return { taskAppliesToDate };
};
