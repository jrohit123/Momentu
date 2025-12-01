import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay, subDays, isBefore } from "date-fns";
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

interface TaskCompletion {
  id: string;
  assignment_id: string;
  completion_date: string;
  status: TaskStatus;
  quantity_completed: number | null;
  notes: string | null;
}

interface DailyTask {
  assignment: TaskAssignment;
  completion?: TaskCompletion;
  status: TaskStatus;
  originalDate?: string;
}

export const useDailyTasks = (userId: string, targetDate: Date) => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [pendingTasks, setPendingTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { taskAppliesToDate } = useTaskRecurrence();
  const { isWorkingDay, getNextWorkingDay } = useWorkingDays(userId);

  useEffect(() => {
    fetchDailyTasks();
  }, [userId, targetDate]);

  const fetchDailyTasks = async () => {
    try {
      setLoading(true);
      const dateStr = format(targetDate, "yyyy-MM-dd");
      const workingDayInfo = isWorkingDay(targetDate);

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
        setPendingTasks([]);
        setLoading(false);
        return;
      }

      // Fetch completions for today and past dates
      const { data: completions, error: compError } = await supabase
        .from("task_completions")
        .select("*")
        .in(
          "assignment_id",
          assignments.map((a) => a.id)
        );

      if (compError) throw compError;

      const completionMap = new Map<string, TaskCompletion[]>();
      completions?.forEach((c) => {
        const key = `${c.assignment_id}-${c.completion_date}`;
        if (!completionMap.has(key)) {
          completionMap.set(key, []);
        }
        completionMap.get(key)!.push(c);
      });

      // If not a working day, all tasks are NA
      if (!workingDayInfo.isWorkingDay) {
        const naTasks: DailyTask[] = (assignments as TaskAssignment[])
          .filter((a) => taskAppliesToDate(a.task, targetDate))
          .map((assignment) => ({
            assignment,
            status: "not_applicable" as TaskStatus,
          }));
        setTasks(naTasks);
        setPendingTasks([]);
        setLoading(false);
        return;
      }

      // Process tasks for today
      const todayTasks: DailyTask[] = [];
      const pending: DailyTask[] = [];

      for (const assignment of assignments as TaskAssignment[]) {
        const task = assignment.task;
        
        // Check if task applies to this date
        if (taskAppliesToDate(task, targetDate)) {
          const key = `${assignment.id}-${dateStr}`;
          const completion = completionMap.get(key)?.[0];

          todayTasks.push({
            assignment,
            completion,
            status: completion?.status || "scheduled",
          });
        }

        // Check for pending tasks from previous working days
        let checkDate = subDays(targetDate, 1);
        let daysChecked = 0;
        
        while (daysChecked < 30) {
          const checkDateInfo = isWorkingDay(checkDate);
          
          if (checkDateInfo.isWorkingDay && taskAppliesToDate(task, checkDate)) {
            const checkDateStr = format(checkDate, "yyyy-MM-dd");
            const key = `${assignment.id}-${checkDateStr}`;
            const completion = completionMap.get(key)?.[0];

            // If not done or marked as pending, it carries forward
            if (!completion || completion.status === "pending" || completion.status === "not_done") {
              const existingPending = pending.find(
                (p) => p.assignment.id === assignment.id && p.originalDate === checkDateStr
              );
              
              if (!existingPending) {
                pending.push({
                  assignment,
                  completion,
                  status: "pending",
                  originalDate: checkDateStr,
                });
              }
            }
          }
          
          checkDate = subDays(checkDate, 1);
          daysChecked++;
        }
      }

      setTasks(todayTasks);
      setPendingTasks(pending);
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

  const markTaskComplete = async (
    assignmentId: string,
    status: TaskStatus,
    quantityCompleted?: number,
    notes?: string,
    originalDate?: string
  ) => {
    try {
      const completionDate = originalDate || format(targetDate, "yyyy-MM-dd");

      // Check if completion already exists
      const { data: existing } = await supabase
        .from("task_completions")
        .select("id")
        .eq("assignment_id", assignmentId)
        .eq("completion_date", completionDate)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("task_completions")
          .update({
            status,
            quantity_completed: quantityCompleted,
            notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("task_completions")
          .insert({
            assignment_id: assignmentId,
            completion_date: completionDate,
            status,
            quantity_completed: quantityCompleted,
            notes,
          });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Task updated successfully",
      });

      // Refresh tasks
      await fetchDailyTasks();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return {
    tasks,
    pendingTasks,
    loading,
    markTaskComplete,
    refresh: fetchDailyTasks,
  };
};
