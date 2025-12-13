import { useMemo } from "react";
import { RRule, Frequency } from "rrule";
import { startOfDay, endOfDay, isSameDay } from "date-fns";

interface RecurrenceConfig {
  frequency?: string;
  interval?: number;
  days?: number[]; // For weekly recurrence (0=Sunday, 1=Monday, etc.)
  byweekday?: number[];
  bymonthday?: number[];
  bysetpos?: number[];
  monthlyType?: "date" | "weekday";
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
  const getFrequency = (type: string): Frequency => {
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

      // Handle custom recurrence
      if (!task.recurrence_config) {
        return false;
      }

      try {
        const config = task.recurrence_config;
        // Create dtstart in UTC to avoid timezone issues
        // Parse the created_at date and create a UTC date at midnight
        const createdDate = new Date(task.created_at);
        const dtstart = new Date(Date.UTC(
          createdDate.getUTCFullYear(),
          createdDate.getUTCMonth(),
          createdDate.getUTCDate(),
          0, 0, 0, 0
        ));
        
        // Build RRule options
        const options: any = {
          freq: getFrequency(task.recurrence_type),
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

        // Handle monthly recurrence
        if (task.recurrence_type === "monthly") {
          if (config.monthlyType === "weekday" && config.bysetpos && config.byweekday) {
            // Monthly relative pattern (e.g., "First Monday", "Last Friday")
            // RRule uses: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
            // Our system uses: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
            // Mapping: [Sunday(0), Monday(1), Tuesday(2), Wednesday(3), Thursday(4), Friday(5), Saturday(6)]
            //          -> [RRule Sunday(6), RRule Monday(0), RRule Tuesday(1), RRule Wednesday(2), RRule Thursday(3), RRule Friday(4), RRule Saturday(5)]
            const rruleWeekdayMap = [6, 0, 1, 2, 3, 4, 5]; // Maps our day index to RRule weekday
            options.bysetpos = config.bysetpos;
            options.byweekday = config.byweekday.map((day: number) => {
              return rruleWeekdayMap[day];
            });
          } else if (config.monthlyType === "date" && config.dayOfMonth) {
            // Monthly by day of month (e.g., "On day 15")
            options.bymonthday = [config.dayOfMonth];
          } else if (config.bymonthday && config.bymonthday.length > 0) {
            // Legacy support
            options.bymonthday = config.bymonthday;
          }
        } else {
          // For weekly recurrence - handle both 'days' (from UI) and 'byweekday' (legacy)
          if (task.recurrence_type === "weekly") {
            const weekdays = config.days || config.byweekday || [];
            if (weekdays.length > 0) {
              // Convert day numbers (0=Sunday, 1=Monday, etc.) to RRule weekdays
              // RRule uses: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
              // Our system uses: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
              const rruleWeekdayMap = [6, 0, 1, 2, 3, 4, 5]; // Maps our day index to RRule weekday
              options.byweekday = weekdays.map((day: number) => {
                return rruleWeekdayMap[day];
              });
            }
          } else if (config.byweekday && config.byweekday.length > 0) {
            // For other recurrence types
            options.byweekday = config.byweekday;
          }
          // For other recurrence types that might use bymonthday
          if (config.bymonthday && config.bymonthday.length > 0) {
            options.bymonthday = config.bymonthday;
          }
        }

        const rule = new RRule(options);
        
        // Check if target date matches any occurrence
        // Normalize target date to UTC to match RRule's output
        const targetDateUTC = new Date(Date.UTC(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          0, 0, 0, 0
        ));
        const targetStart = targetDateUTC;
        const targetEnd = new Date(targetDateUTC);
        targetEnd.setUTCHours(23, 59, 59, 999);
        
        const occurrences = rule.between(targetStart, targetEnd, true);
        
        // Check if any occurrence falls on the target date (compare by UTC date components)
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth();
        const targetDay = targetDate.getDate();
        
        return occurrences.some(occurrence => {
          const occDate = new Date(occurrence);
          return occDate.getUTCFullYear() === targetYear &&
                 occDate.getUTCMonth() === targetMonth &&
                 occDate.getUTCDate() === targetDay;
        });
      } catch (error) {
        console.error("Error processing recurrence:", error);
        return false;
      }
    };
  }, []);

  return { taskAppliesToDate };
};
