import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { useTaskRecurrence } from "./useTaskRecurrence";
import { useWorkingDays } from "./useWorkingDays";
import { useSystemSettings } from "./useSystemSettings";
import { formatDateForDB } from "@/lib/dateUtils";
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
  dailyApprovalStatuses: Map<string, string | null>;
  dailyManagerComments: Map<string, string | null>;
}

export const useMonthlyTasks = (userId: string, currentMonth: Date, targetUserId?: string) => {
  const [tasks, setTasks] = useState<MonthlyTaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { toast } = useToast();
  const { taskAppliesToDate } = useTaskRecurrence();
  // Use targetUserId if provided, otherwise use userId
  const effectiveUserId = targetUserId || userId;
  const { isWorkingDay } = useWorkingDays(effectiveUserId);
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
    if (organizationId) {
      fetchMonthlyTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentMonth, targetUserId, organizationId]);

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
          assigned_to
        `)
        .eq("assigned_to", effectiveUserId);

      if (assignError) {
        console.error("Error fetching task assignments:", assignError);
        throw assignError;
      }

      if (!assignments || assignments.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Fetch tasks using RPC function for managers viewing subordinates
      // This bypasses RLS issues by using a SECURITY DEFINER function
      const taskIds = assignments.map((a) => a.task_id);
      
      let tasks: Task[] | null = null;
      
      // If viewing a subordinate (targetUserId is different from userId), use RPC function
      if (targetUserId && targetUserId !== userId) {
        const { data: rpcTasks, error: rpcError } = await (supabase.rpc as any)('get_subordinate_tasks', { _task_ids: taskIds });

        if (rpcError) {
          console.error("Error fetching tasks via RPC:", rpcError);
          // Fall back to direct query
          const { data: directTasks, error: directError } = await supabase
            .from("tasks")
            .select(`
              id,
              name,
              description,
              category,
              benchmark,
              recurrence_type,
              recurrence_config,
              created_at
            `)
            .in("id", taskIds);
          
          if (directError) {
            console.error("Error fetching tasks directly:", directError);
            throw directError;
          }
          tasks = directTasks;
        } else {
          tasks = rpcTasks || null;
        }
      } else {
        // For own tasks, use direct query (RLS should work fine)
        const { data: directTasks, error: directError } = await supabase
          .from("tasks")
          .select(`
            id,
            name,
            description,
            category,
            benchmark,
            recurrence_type,
            recurrence_config,
            created_at
          `)
          .in("id", taskIds);

        if (directError) {
          console.error("Error fetching tasks:", directError);
          throw directError;
        }
        tasks = directTasks;
      }

      // Create a map of task_id -> task for quick lookup
      const taskMap = new Map<string, Task>();
      tasks?.forEach((task) => {
        taskMap.set(task.id, task);
      });

      // Join assignments with tasks
      const assignmentsWithTasks: TaskAssignment[] = assignments
        .map((assignment) => ({
          ...assignment,
          task: taskMap.get(assignment.task_id) || null,
        }))
        .filter((assignment) => assignment.task !== null) as TaskAssignment[];

      if (assignmentsWithTasks.length === 0) {
        console.warn(`Found ${assignments.length} assignments but none have accessible tasks (RLS issue or deleted tasks)`);
        setTasks([]);
        setLoading(false);
        return;
      }

      // Fetch all completions for the month
      // Need to check both scheduled_date (when tasks were due) and completion_date (when they were done)
      const monthStartStr = formatDateForDB(monthStart, settings.timezone);
      const monthEndStr = formatDateForDB(monthEnd, settings.timezone);

      // Fetch all completions for these assignments, then filter in code
      const { data: allCompletions, error: compError } = await supabase
        .from("task_completions")
        .select("*, approval_status, manager_comment")
        .in(
          "assignment_id",
          assignmentsWithTasks.map((a) => a.id)
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
      const completionMap = new Map<string, { status: TaskStatus; scheduled_date: string; completion_date: string; notes: string | null; quantity_completed: number | null; approval_status: string | null; manager_comment: string | null }>();
      
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
          approval_status: c.approval_status || null,
          manager_comment: c.manager_comment || null,
        });
      });

      // Process each task assignment
      // We've already filtered out null tasks above
      const monthlyData: MonthlyTaskData[] = assignmentsWithTasks.map((assignment) => {
        const task = assignment.task!; // Safe to use ! here since we filtered nulls
        const dailyStatuses = new Map<string, TaskStatus>();
        const dailyNotes = new Map<string, string | null>();
        const dailyCompletionDates = new Map<string, string | null>();
        const dailyQuantities = new Map<string, number | null>();
        const dailyApprovalStatuses = new Map<string, string | null>();
        const dailyManagerComments = new Map<string, string | null>();

        for (const day of daysInMonth) {
          const dateStr = formatDateForDB(day, settings.timezone);
          const workingDayInfo = isWorkingDay(day);

          // Check if task applies to this date
          if (!taskAppliesToDate(task, day)) {
            dailyStatuses.set(dateStr, "not_applicable");
            dailyNotes.set(dateStr, null);
            dailyCompletionDates.set(dateStr, null);
            dailyApprovalStatuses.set(dateStr, null);
            dailyManagerComments.set(dateStr, null);
            continue;
          }

          // Check completion status FIRST (even for weekends)
          // This ensures completions on weekends are visible
          const key = `${assignment.id}-${dateStr}`;
          const completion = completionMap.get(key);

          // If there's a completion, use it regardless of whether it's a working day
          // This allows weekend completions to be visible
          if (completion) {
            // Store notes, completion date, quantity, approval status, and manager comment for this day
            dailyNotes.set(dateStr, completion.notes);
            dailyCompletionDates.set(dateStr, completion.completion_date);
            dailyQuantities.set(dateStr, completion.quantity_completed);
            dailyApprovalStatuses.set(dateStr, completion.approval_status);
            dailyManagerComments.set(dateStr, completion.manager_comment);
            
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
            continue; // Skip the rest - we have a completion
          }

          // If not a working day AND no completion, mark as not applicable
          if (!workingDayInfo.isWorkingDay) {
            dailyStatuses.set(dateStr, "not_applicable");
            dailyNotes.set(dateStr, null);
            dailyCompletionDates.set(dateStr, null);
            dailyApprovalStatuses.set(dateStr, null);
            continue;
          }

          // No completion record for this scheduled date (and it's a working day)
          dailyNotes.set(dateStr, null);
          dailyCompletionDates.set(dateStr, null);
          dailyQuantities.set(dateStr, null);
          dailyApprovalStatuses.set(dateStr, null);
          dailyManagerComments.set(dateStr, null);
          
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

        return {
          assignment,
          dailyStatuses,
          dailyNotes,
          dailyCompletionDates,
          dailyQuantities,
          dailyApprovalStatuses,
          dailyManagerComments,
        };
      });

      setTasks(monthlyData);
    } catch (error: any) {
      if (error.message !== "Cannot read properties of undefined (reading 'timezone')") {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
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
