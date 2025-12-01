import { useMemo } from "react";
import { RRule, Frequency } from "rrule";
import { startOfDay, endOfDay, isSameDay } from "date-fns";

interface RecurrenceConfig {
  frequency?: string;
  interval?: number;
  byweekday?: number[];
  bymonthday?: number[];
  until?: string;
  count?: number;
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
        const dtstart = startOfDay(new Date(task.created_at));
        
        // Build RRule options
        const options: any = {
          freq: getFrequency(task.recurrence_type),
          dtstart,
          interval: config.interval || 1,
        };

        // Add end condition
        if (config.until) {
          options.until = endOfDay(new Date(config.until));
        } else if (config.count) {
          options.count = config.count;
        }

        // Add weekly/monthly specifics
        if (config.byweekday && config.byweekday.length > 0) {
          options.byweekday = config.byweekday;
        }
        if (config.bymonthday && config.bymonthday.length > 0) {
          options.bymonthday = config.bymonthday;
        }

        const rule = new RRule(options);
        
        // Check if target date matches any occurrence
        const targetStart = startOfDay(targetDate);
        const targetEnd = endOfDay(targetDate);
        
        const occurrences = rule.between(targetStart, targetEnd, true);
        return occurrences.length > 0;
      } catch (error) {
        console.error("Error processing recurrence:", error);
        return false;
      }
    };
  }, []);

  return { taskAppliesToDate };
};
