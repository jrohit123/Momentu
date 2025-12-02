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

interface MonthlyTaskData {
  assignment: TaskAssignment;
  dailyStatuses: Map<string, TaskStatus>;
}

export const useMonthlyTasks = (userId: string, currentMonth: Date) => {
  const [tasks, setTasks] = useState<MonthlyTaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { taskAppliesToDate } = useTaskRecurrence();
  const { isWorkingDay } = useWorkingDays(userId);

  useEffect(() => {
    fetchMonthlyTasks();
  }, [userId, currentMonth]);

  const fetchMonthlyTasks = async () => {
    try {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Fetch user's task assignments with task details
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
        .eq("assigned_to", userId);

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Fetch all completions for the month
      const monthStartStr = format(monthStart, "yyyy-MM-dd");
      const monthEndStr = format(monthEnd, "yyyy-MM-dd");

      const { data: completions, error: compError } = await supabase
        .from("task_completions")
        .select("*")
        .in(
          "assignment_id",
          assignments.map((a) => a.id)
        )
        .gte("completion_date", monthStartStr)
        .lte("completion_date", monthEndStr);

      if (compError) throw compError;

      // Build completion map
      const completionMap = new Map<string, TaskStatus>();
      completions?.forEach((c) => {
        const key = `${c.assignment_id}-${c.completion_date}`;
        completionMap.set(key, c.status);
      });

      // Process each task assignment
      const monthlyData: MonthlyTaskData[] = (assignments as TaskAssignment[]).map((assignment) => {
        const task = assignment.task;
        const dailyStatuses = new Map<string, TaskStatus>();

        for (const day of daysInMonth) {
          const dateStr = format(day, "yyyy-MM-dd");
          const workingDayInfo = isWorkingDay(day);

          // Check if task applies to this date
          if (!taskAppliesToDate(task, day)) {
            dailyStatuses.set(dateStr, "not_applicable");
            continue;
          }

          // If not a working day, mark as not applicable
          if (!workingDayInfo.isWorkingDay) {
            dailyStatuses.set(dateStr, "not_applicable");
            continue;
          }

          // Check completion status
          const key = `${assignment.id}-${dateStr}`;
          const completionStatus = completionMap.get(key);

          if (completionStatus) {
            dailyStatuses.set(dateStr, completionStatus);
          } else {
            // No completion record - check if it's in the past or future
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
