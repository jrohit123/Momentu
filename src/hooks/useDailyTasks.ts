import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfDay, subDays, isBefore } from "date-fns";
import { useTaskRecurrence } from "./useTaskRecurrence";
import { useWorkingDays } from "./useWorkingDays";
import { useSystemSettings } from "./useSystemSettings";
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
  assigned_by: string;
  assigner?: {
    id: string;
    full_name: string | null;
  } | null;
  task: Task;
}

interface TaskCompletion {
  id: string;
  assignment_id: string;
  scheduled_date: string;
  completion_date: string;
  status: TaskStatus;
  quantity_completed: number | null;
  notes: string | null;
  approval_status: string;
  approved_by: string | null;
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
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { toast } = useToast();
  const { taskAppliesToDate } = useTaskRecurrence();
  const { isWorkingDay, getNextWorkingDay } = useWorkingDays(userId);
  const { settings } = useSystemSettings(organizationId);

  useEffect(() => {
    const fetchOrganizationId = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("organization_id")
          .eq("id", userId)
          .single();

        if (error) throw error;
        setOrganizationId(data?.organization_id || null);
      } catch (error) {
        console.error("Error fetching organization ID:", error);
      }
    };

    fetchOrganizationId();
    fetchDailyTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, targetDate]);

  const fetchDailyTasks = async () => {
    try {
      setLoading(true);
      const dateStr = format(targetDate, "yyyy-MM-dd");
      const workingDayInfo = isWorkingDay(targetDate);

      // Fetch user's task assignments with task details and assigner info
      const { data: assignments, error: assignError } = await supabase
        .from("task_assignments")
        .select(`
          id,
          task_id,
          assigned_to,
          assigned_by,
          assigner:users!task_assignments_assigned_by_fkey (
            id,
            full_name
          ),
          task:tasks!task_assignments_task_id_fkey (
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

      // Fetch completions for today and past 30 days
      // Need to check both scheduled_date (when task was due) and completion_date (when it was done)
      // Also fetch completions that were completed today but scheduled for previous days (delayed tasks)
      // And fetch completions from past days to check if they're truly pending
      const pastDateStr = format(subDays(targetDate, 30), "yyyy-MM-dd");
      const { data: completions, error: compError } = await supabase
        .from("task_completions")
        .select("*")
        .in(
          "assignment_id",
          assignments.map((a) => a.id)
        )
        .or(`scheduled_date.gte.${pastDateStr},completion_date.gte.${pastDateStr}`);

      if (compError) throw compError;

      // Build two maps:
      // 1. By scheduled_date (for tasks scheduled for today)
      // 2. By completion_date (for delayed tasks completed today)
      const completionMapByScheduled = new Map<string, TaskCompletion[]>();
      const completionMapByCompletion = new Map<string, TaskCompletion[]>();
      
      completions?.forEach((c) => {
        // Map by scheduled_date (when task was supposed to be done)
        const scheduledDate = c.scheduled_date || c.completion_date; // Fallback for old records
        const scheduledKey = `${c.assignment_id}-${scheduledDate}`;
        if (!completionMapByScheduled.has(scheduledKey)) {
          completionMapByScheduled.set(scheduledKey, []);
        }
        completionMapByScheduled.get(scheduledKey)!.push(c);
        
        // Also map by completion_date (for delayed tasks completed today)
        const completionKey = `${c.assignment_id}-${c.completion_date}`;
        if (!completionMapByCompletion.has(completionKey)) {
          completionMapByCompletion.set(completionKey, []);
        }
        completionMapByCompletion.get(completionKey)!.push(c);
      });

      // If not a working day, all tasks are NA
      // But only if there are no completions for today (to prevent showing NA after updates)
      if (!workingDayInfo.isWorkingDay) {
        // Check if any completions exist for today
        const hasCompletionsForToday = completions?.some(c => {
          const scheduledDate = c.scheduled_date || c.completion_date;
          return scheduledDate === dateStr || c.completion_date === dateStr;
        });
        
        // If there are completions for today, process them normally (don't mark as NA)
        // Otherwise, mark all as NA since it's not a working day
        if (!hasCompletionsForToday) {
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
        // If hasCompletionsForToday is true, continue processing below (don't return)
      }

      // Process tasks for today
      const todayTasks: DailyTask[] = [];
      const pending: DailyTask[] = [];

      for (const assignment of assignments as TaskAssignment[]) {
        const task = assignment.task;
        
        // Check if task applies to this date
        if (taskAppliesToDate(task, targetDate)) {
          // Look for completion by scheduled_date (when it was supposed to be done)
          const scheduledKey = `${assignment.id}-${dateStr}`;
          let completion = completionMapByScheduled.get(scheduledKey)?.[0];

          // Default to scheduled if no completion exists
          // This is critical: tasks without completions should be "scheduled", not "not_applicable"
          let status: TaskStatus = "scheduled";
          
          // If completion exists and has a valid status (not "not_applicable"), use its status
          // "not_applicable" should only be set for non-working days, not for individual task completions
          if (completion && completion.status && completion.status !== "not_applicable") {
            status = completion.status;
            
            // Check if task was completed on a different date (delayed)
            // Compare scheduled_date with completion_date
            const scheduledDate = completion.scheduled_date || completion.completion_date;
            const completionDate = completion.completion_date;
            
            // Only mark as delayed if it was scheduled for today but completed later
            // AND the status is completed or partial
            if (scheduledDate === dateStr && 
                completionDate && 
                completionDate > scheduledDate && 
                (completion.status === "completed" || completion.status === "partial")) {
              // Task was scheduled for this date but completed later - it's delayed
              status = "delayed";
            }
          }

          todayTasks.push({
            assignment,
            completion,
            status,
          });
        }
        
        // Also check for delayed tasks: tasks scheduled for previous days but completed today
        // These should show up in today's tasks as "delayed"
        const completionKey = `${assignment.id}-${dateStr}`;
        const delayedCompletion = completionMapByCompletion.get(completionKey)?.[0];
        
        if (delayedCompletion) {
          const scheduledDate = delayedCompletion.scheduled_date || delayedCompletion.completion_date;
          const completionDate = delayedCompletion.completion_date;
          
          // If this task was scheduled for a previous day but completed today, it's delayed
          if (scheduledDate < dateStr && completionDate === dateStr &&
              (delayedCompletion.status === "completed" || delayedCompletion.status === "partial")) {
            // Check if task applies to the scheduled date (not today, but we still want to show it)
            const scheduledDateObj = new Date(scheduledDate);
            if (taskAppliesToDate(task, scheduledDateObj)) {
              // Check if it's not already in todayTasks (in case task also applies to today)
              const alreadyInToday = todayTasks.some(t => t.assignment.id === assignment.id);
              
              if (!alreadyInToday) {
                todayTasks.push({
                  assignment,
                  completion: delayedCompletion,
                  status: "delayed",
                  originalDate: scheduledDate,
                });
              }
            }
          }
        }

        // Check for pending tasks from previous working days
        let checkDate = subDays(targetDate, 1);
        let daysChecked = 0;
        
        while (daysChecked < 30) {
          const checkDateInfo = isWorkingDay(checkDate);
          
          if (checkDateInfo.isWorkingDay && taskAppliesToDate(task, checkDate)) {
            const checkDateStr = format(checkDate, "yyyy-MM-dd");
            const scheduledKey = `${assignment.id}-${checkDateStr}`;
            const completion = completionMapByScheduled.get(scheduledKey)?.[0];

            // Check if task needs to carry forward
            // Only tasks that are NOT completed should be in pending
            // Delayed tasks that are completed should show up in today's tasks, not pending
            const scheduledDate = completion?.scheduled_date || completion?.completion_date;
            const completionDate = completion?.completion_date;
            
            // Check if task was completed (even if delayed) - these should NOT be in pending
            // A task is considered completed if:
            // 1. It has status "completed", OR
            // 2. It has status "partial" with a completion_date (even if delayed)
            const isCompleted = completion && 
                               (completion.status === "completed" || 
                                completion.status === "partial");
            
            // Only add to pending if there's no completion record OR the task is explicitly not done
            // Do NOT add if task is completed (even if delayed)
            if (!isCompleted && (!completion || completion.status === "not_done")) {
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
      // Check dependencies before allowing completion
      const scheduledDate = originalDate || format(targetDate, "yyyy-MM-dd");
      
      // Get the task ID from the assignment
      const { data: assignment, error: assignError } = await supabase
        .from("task_assignments")
        .select("task_id")
        .eq("id", assignmentId)
        .single();

      if (assignError) throw assignError;
      if (!assignment) throw new Error("Assignment not found");

      // Check if task has dependencies
      const { data: dependencies, error: depError } = await supabase
        .from("task_dependencies")
        .select("depends_on_task_id")
        .eq("task_id", assignment.task_id);

      if (depError) throw depError;

      // If there are dependencies, check if they're all completed
      if (dependencies && dependencies.length > 0) {
        const dependencyTaskIds = dependencies.map((d) => d.depends_on_task_id);
        
        // Get all assignments for the dependency tasks assigned to the same user
        const { data: dependencyAssignments, error: depAssignError } = await supabase
          .from("task_assignments")
          .select("id, task_id")
          .in("task_id", dependencyTaskIds)
          .eq("assigned_to", userId);

        if (depAssignError) throw depAssignError;

        if (dependencyAssignments && dependencyAssignments.length > 0) {
          // Check if all dependency tasks are completed for the scheduled date
          const depAssignmentIds = dependencyAssignments.map((a) => a.id);
          const { data: depCompletions, error: depCompError } = await supabase
            .from("task_completions")
            .select("assignment_id, status")
            .in("assignment_id", depAssignmentIds)
            .eq("scheduled_date", scheduledDate)
            .in("status", ["completed", "partial"]); // Partial also counts as progress

          if (depCompError) throw depCompError;

          // Check if all dependencies are completed
          const completedDepIds = new Set(depCompletions?.map((c) => c.assignment_id) || []);
          const incompleteDeps = dependencyAssignments.filter(
            (a) => !completedDepIds.has(a.id)
          );

          if (incompleteDeps.length > 0) {
            // Get task names for incomplete dependencies
            const { data: incompleteTasks, error: taskError } = await supabase
              .from("tasks")
              .select("name")
              .in("id", incompleteDeps.map((a) => a.task_id));

            if (taskError) throw taskError;

            const taskNames = incompleteTasks?.map((t) => t.name).join(", ") || "dependencies";
            throw new Error(
              `Cannot complete this task. The following dependencies must be completed first: ${taskNames}`
            );
          }
        }
      }

      // completionDate is when it's actually being completed (today)
      const completionDate = format(targetDate, "yyyy-MM-dd");

      // Check if completion already exists for this scheduled date
      const { data: existing } = await supabase
        .from("task_completions")
        .select("id")
        .eq("assignment_id", assignmentId)
        .eq("scheduled_date", scheduledDate)
        .maybeSingle();

      if (existing) {
        // Update existing - check approval settings
        const approvalData = settings.auto_approve_tasks
          ? {
              approval_status: "approved" as const,
              approved_by: userId,
            }
          : {
              approval_status: "pending" as const,
              approved_by: null,
            };

        const { error } = await supabase
          .from("task_completions")
          .update({
            completion_date: completionDate,
            status,
            quantity_completed: quantityCompleted,
            notes,
            ...approvalData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new - check approval settings
        const approvalData = settings.auto_approve_tasks
          ? {
              approval_status: "approved" as const,
              approved_by: userId,
            }
          : {
              approval_status: "pending" as const,
              approved_by: null,
            };

        const { error } = await supabase
          .from("task_completions")
          .insert({
            assignment_id: assignmentId,
            scheduled_date: scheduledDate,
            completion_date: completionDate,
            status,
            quantity_completed: quantityCompleted,
            notes,
            ...approvalData,
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
