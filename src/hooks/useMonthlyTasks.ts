import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { useTaskRecurrence } from "./useTaskRecurrence";
import { useWorkingDays } from "./useWorkingDays";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface Task {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  benchmark: number | null;
  recurrence_type: string;
  recurrence_config: any;
  created_at: string;
}

interface TaskAssignment {
  id: string;
  task_id: string;
  assigned_to: string;
  task: Task;
}

interface DayStatus {
  date: Date;
  status: TaskStatus;
}

interface DailyStatusData {
  status: TaskStatus;
  notes: string | null;
}

interface MonthlyTaskData {
  assignment: TaskAssignment;
  dailyStatuses: Map<string, TaskStatus>;
  dailyNotes: Map<string, string | null>;
  dailyCompletionDates: Map<string, string | null>;
  dailyQuantities: Map<string, number | null>;
}

export const useMonthlyTasks = (userId: string, currentMonth: Date, targetUserId?: string) => {
  const [tasks, setTasks] = useState<MonthlyTaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { taskAppliesToDate } = useTaskRecurrence();
  // Use targetUserId if provided, otherwise use userId
  const effectiveUserId = targetUserId || userId;
  const { isWorkingDay } = useWorkingDays(effectiveUserId);

  useEffect(() => {
    fetchMonthlyTasks();
  }, [userId, currentMonth, targetUserId]);

  const fetchMonthlyTasks = async () => {
    try {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Fetch task assignments for the target user (or current user if not specified)
      const { data: assignments, error: assignError } = await supabase
        .from("task_assignments")
        .select(`
          id,
          task_id,
          assigned_to,
          task:tasks (
            id,
            name,
            description,
            category,
            benchmark,
            recurrence_type,
            recurrence_config,
            created_at
          )
        `)
        .eq("assigned_to", effectiveUserId);

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Fetch all completions for the month
      // Need to check both scheduled_date (when tasks were due) and completion_date (when they were done)
      const monthStartStr = format(monthStart, "yyyy-MM-dd");
      const monthEndStr = format(monthEnd, "yyyy-MM-dd");

      // Fetch all completions for these assignments, then filter in code
      const { data: allCompletions, error: compError } = await supabase
        .from("task_completions")
        .select("*")
        .in(
          "assignment_id",
          assignments.map((a) => a.id)
        );

      if (compError) throw compError;

      // Filter completions where either scheduled_date or completion_date falls within the month
      const completions = allCompletions?.filter((c) => {
        const scheduledDate = c.scheduled_date || c.completion_date;
        const completionDate = c.completion_date;
        return (scheduledDate >= monthStartStr && scheduledDate <= monthEndStr) ||
               (completionDate >= monthStartStr && completionDate <= monthEndStr);
      });

      if (compError) throw compError;

      // Build completion map - key: assignment_id-scheduled_date, value: completion record
      const completionMap = new Map<string, { status: TaskStatus; scheduled_date: string; completion_date: string; notes: string | null; quantity_completed: number | null }>();
      
      completions?.forEach((c) => {
        // Use scheduled_date as the key since that's when the task was supposed to be done
        const scheduledDate = c.scheduled_date || c.completion_date; // Fallback for old records
        const key = `${c.assignment_id}-${scheduledDate}`;
        completionMap.set(key, {
          status: c.status,
          scheduled_date: c.scheduled_date || c.completion_date,
          completion_date: c.completion_date,
          notes: c.notes,
          quantity_completed: c.quantity_completed,
        });
      });

      // Process each task assignment
      const monthlyData: MonthlyTaskData[] = (assignments as TaskAssignment[]).map((assignment) => {
        const task = assignment.task;
        const dailyStatuses = new Map<string, TaskStatus>();
        const dailyNotes = new Map<string, string | null>();
        const dailyCompletionDates = new Map<string, string | null>();
        const dailyQuantities = new Map<string, number | null>();

        for (const day of daysInMonth) {
          const dateStr = format(day, "yyyy-MM-dd");
          const workingDayInfo = isWorkingDay(day);

          // Check if task applies to this date
          if (!taskAppliesToDate(task, day)) {
            dailyStatuses.set(dateStr, "not_applicable");
            dailyNotes.set(dateStr, null);
            dailyCompletionDates.set(dateStr, null);
            continue;
          }

          // If not a working day, mark as not applicable
          if (!workingDayInfo.isWorkingDay) {
            dailyStatuses.set(dateStr, "not_applicable");
            dailyNotes.set(dateStr, null);
            dailyCompletionDates.set(dateStr, null);
            continue;
          }

          // Check completion status
          const key = `${assignment.id}-${dateStr}`;
          const completion = completionMap.get(key);

          if (completion) {
            // Store notes, completion date, and quantity for this day
            dailyNotes.set(dateStr, completion.notes);
            dailyCompletionDates.set(dateStr, completion.completion_date);
            dailyQuantities.set(dateStr, completion.quantity_completed);
            
            // There's a completion record for this scheduled date
            // Check if it was completed on time or delayed
            if (completion.completion_date > completion.scheduled_date && 
                (completion.status === "completed" || completion.status === "partial")) {
              // Task was scheduled for this date but completed later - mark as delayed
              dailyStatuses.set(dateStr, "delayed");
            } else {
              // Task was completed on time (or on scheduled date)
              dailyStatuses.set(dateStr, completion.status);
            }
          } else {
            // No completion record for this scheduled date
            dailyNotes.set(dateStr, null);
            dailyCompletionDates.set(dateStr, null);
            dailyQuantities.set(dateStr, null);
            
            // Check if it's in the past or future
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dayDate = new Date(day);
            dayDate.setHours(0, 0, 0, 0);

            if (dayDate > today) {
              dailyStatuses.set(dateStr, "scheduled");
            } else if (dayDate.getTime() === today.getTime()) {
              dailyStatuses.set(dateStr, "scheduled");
            } else {
              // Past working day with no completion - not done
              dailyStatuses.set(dateStr, "not_done");
            }
          }
        }

        return {
          assignment,
          dailyStatuses,
          dailyNotes,
          dailyCompletionDates,
          dailyQuantities,
        };
      });

      setTasks(monthlyData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    tasks,
    loading,
    refresh: fetchMonthlyTasks,
  };
};
