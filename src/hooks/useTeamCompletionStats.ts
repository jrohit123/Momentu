import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface TeamMemberStats {
  userId: string;
  fullName: string;
  email: string;
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
}

export const useTeamCompletionStats = (userId: string, currentMonth: Date) => {
  const [teamStats, setTeamStats] = useState<TeamMemberStats[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTeamStats();
  }, [userId, currentMonth]);

  const fetchTeamStats = async () => {
    try {
      setLoading(true);
      
      // Fetch subordinates
      const { data: subordinates, error: subError } = await supabase
        .from("users")
        .select("id, full_name, email")
        .eq("manager_id", userId)
        .eq("is_active", true);

      if (subError) throw subError;

      if (!subordinates || subordinates.length === 0) {
        setTeamStats([]);
        setLoading(false);
        return;
      }

      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const monthStartStr = format(monthStart, "yyyy-MM-dd");
      const monthEndStr = format(monthEnd, "yyyy-MM-dd");

      // Fetch stats for each subordinate
      const statsPromises = subordinates.map(async (subordinate) => {
        // Get task assignments for this subordinate
        const { data: assignments } = await supabase
          .from("task_assignments")
          .select("id")
          .eq("assigned_to", subordinate.id);

        if (!assignments || assignments.length === 0) {
          return {
            userId: subordinate.id,
            fullName: subordinate.full_name,
            email: subordinate.email,
            totalTasks: 0,
            completedTasks: 0,
            completionPercentage: 0,
          };
        }

        // Get completions for this month
        const { data: completions } = await supabase
          .from("task_completions")
          .select("status, scheduled_date, completion_date, approval_status")
          .in(
            "assignment_id",
            assignments.map((a) => a.id)
          )
          .or(`scheduled_date.gte.${monthStartStr},completion_date.gte.${monthStartStr}`)
          .or(`scheduled_date.lte.${monthEndStr},completion_date.lte.${monthEndStr}`);

        // Count unique tasks (by scheduled_date)
        const uniqueTasks = new Set<string>();
        let completedCount = 0;

        completions?.forEach((c) => {
          const scheduledDate = c.scheduled_date || c.completion_date;
          if (scheduledDate >= monthStartStr && scheduledDate <= monthEndStr) {
            const taskKey = `${c.assignment_id}-${scheduledDate}`;
            uniqueTasks.add(taskKey);
            if (c.status === "completed" && c.approval_status === "approved") {
              completedCount++;
            }
          }
        });

        const totalTasks = uniqueTasks.size || assignments.length;
        const completionPercentage = totalTasks > 0 
          ? Math.round((completedCount / totalTasks) * 100) 
          : 0;

        return {
          userId: subordinate.id,
          fullName: subordinate.full_name,
          email: subordinate.email,
          totalTasks,
          completedTasks: completedCount,
          completionPercentage,
        };
      });

      const stats = await Promise.all(statsPromises);
      setTeamStats(stats);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch team stats",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    teamStats,
    loading,
    refresh: fetchTeamStats,
  };
};

