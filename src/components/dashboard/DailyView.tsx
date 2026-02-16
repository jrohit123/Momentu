import { useState, useMemo, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, Calendar, Save, Link2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import { useWorkingDays } from "@/hooks/useWorkingDays";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { TaskApprovalBadge } from "@/components/tasks/TaskApprovalBadge";
import { TaskApprovalDialog } from "@/components/tasks/TaskApprovalDialog";
import { Loader2 } from "lucide-react";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface DailyViewProps {
  user: User;
  onCreateTask?: () => void;
}

const DailyView = ({ user, onCreateTask }: DailyViewProps) => {
  const [today] = useState(new Date());
  const [fullName, setFullName] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { tasks, pendingTasks, loading, markTaskComplete } = useDailyTasks(user.id, today);
  const { isWorkingDay, isOnPersonalLeave } = useWorkingDays(user.id);
  const { isManager } = useUserRole(user.id);
  const { settings } = useSystemSettings(organizationId);
  
  // Track modified tasks for bulk update
  const [modifiedTasks, setModifiedTasks] = useState<Map<string, { status: TaskStatus; quantity?: number; notes?: string; originalDate?: string }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dependenciesByTask, setDependenciesByTask] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  
  const workingDayInfo = isWorkingDay(today);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data } = await supabase
        .from("users")
        .select("full_name, organization_id")
        .eq("id", user.id)
        .single();
      
      if (data?.full_name) {
        setFullName(data.full_name);
      }
      if (data?.organization_id) {
        setOrganizationId(data.organization_id);
      }
    };

    fetchUserProfile();
  }, [user.id]);

  // Fetch employee names for subordinate tasks
  useEffect(() => {
    const fetchEmployeeNames = async () => {
      if (!isManager) return;
      
      const allAssignedToIds = [
        ...tasks.map(t => t.assignment.assigned_to),
        ...pendingTasks.map(t => t.assignment.assigned_to)
      ].filter((id, index, self) => self.indexOf(id) === index && id !== user.id);

      if (allAssignedToIds.length === 0) {
        setEmployeeNames({});
        return;
      }

      try {
        const { data: employees, error } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", allAssignedToIds);

        if (!error && employees) {
          const namesMap: Record<string, string> = {};
          employees.forEach((emp) => {
            if (emp.full_name) {
              namesMap[emp.id] = emp.full_name;
            }
          });
          setEmployeeNames(namesMap);
        }
      } catch (error) {
        console.error("Error fetching employee names:", error);
      }
    };

    fetchEmployeeNames();
  }, [isManager, tasks, pendingTasks, user.id]);

  // Fetch dependencies for all tasks
  useEffect(() => {
    const fetchDependencies = async () => {
      const allTaskIds = [
        ...tasks.map(t => t.assignment.task.id),
        ...pendingTasks.map(t => t.assignment.task.id)
      ];

      if (allTaskIds.length === 0) {
        setDependenciesByTask({});
        return;
      }

      try {
        const { data: dependencies, error: depError } = await supabase
          .from("task_dependencies")
          .select(`
            task_id,
            depends_on_task_id,
            depends_on_task:tasks!task_dependencies_depends_on_task_id_fkey (
              id,
              name
            )
          `)
          .in("task_id", allTaskIds);

        if (!depError && dependencies) {
          const depsMap: Record<string, Array<{ id: string; name: string }>> = {};
          dependencies.forEach((dep) => {
            if (!depsMap[dep.task_id]) {
              depsMap[dep.task_id] = [];
            }
            if (dep.depends_on_task) {
              depsMap[dep.task_id].push({
                id: dep.depends_on_task.id,
                name: dep.depends_on_task.name,
              });
            }
          });
          setDependenciesByTask(depsMap);
        }
      } catch (error) {
        console.error("Error fetching dependencies:", error);
      }
    };

    fetchDependencies();
  }, [tasks, pendingTasks]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = pendingTasks.length;

    // When user is on leave today, exclude all tasks from completion % calculation
    // (they still show as pending tasks to be completed)
    const todayIsLeave = isOnPersonalLeave(today);
    
    // Calculate completion using the same formula as MonthlyView:
    // - completed: +1
    // - partial: + (quantity / benchmark)
    // - delayed: +0.5
    // - not_done: 0
    // - pending/scheduled: 0
    let totalCompleted = 0;
    let completedCount = 0;
    const totalForCompletion = todayIsLeave ? 0 : total;
    
    if (!todayIsLeave) {
      tasks.forEach((task) => {
        // Only count tasks that are approved (or don't require approval for auto-approved orgs)
        const isApproved = task.completion?.approval_status === 'approved';

        if (isApproved) {
          if (task.status === "completed") {
            totalCompleted += 1;
            completedCount++;
          } else if (task.status === "partial") {
            const quantity = task.completion?.quantity_completed || 0;
            const benchmark = task.assignment.task.benchmark;
            if (benchmark !== null && benchmark > 0) {
              totalCompleted += quantity / benchmark;
            } else {
              // If no benchmark, treat partial as 0.5
              totalCompleted += 0.5;
            }
        } else if (task.status === "delayed") {
          totalCompleted += 0.5;
        }
      }
      // not_done, pending, scheduled, not_applicable all count as 0
      // Also tasks that are completed but not yet approved count as 0
    });
    }

    // Completed-late: tasks completed today but which were pending from a previous date (scheduled_date < today)
    // If Auto-Approve Tasks is true, treat as auto-approved; otherwise require approval_status === "approved"
    const completedLate = tasks.filter(
      (t) =>
        t.originalDate &&
        (t.completion?.status === "completed" || t.completion?.status === "partial") &&
        (settings.auto_approve_tasks || t.completion?.approval_status === "approved")
    ).length;
    
    const completion = totalForCompletion > 0 ? Math.round((totalCompleted / totalForCompletion) * 100) : 0;

    return { total, completed: completedCount, pending, completion, completedLate };
  }, [tasks, pendingTasks, settings.auto_approve_tasks, isOnPersonalLeave, today]);

  // Sort tasks by name
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => 
      a.assignment.task.name.localeCompare(b.assignment.task.name)
    );
  }, [tasks]);

  // Sort pending tasks by originalDate (oldest first), then by name
  const sortedPendingTasks = useMemo(() => {
    return [...pendingTasks].sort((a, b) => {
      // First sort by originalDate (oldest first)
      const dateA = a.originalDate ? new Date(a.originalDate).getTime() : 0;
      const dateB = b.originalDate ? new Date(b.originalDate).getTime() : 0;
      
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // If dates are equal, sort by task name
      return a.assignment.task.name.localeCompare(b.assignment.task.name);
    });
  }, [pendingTasks]);

  const handleTaskChange = (assignmentId: string, status: TaskStatus, quantity?: number, notes?: string, originalDate?: string) => {
    setModifiedTasks((prev) => {
      const newMap = new Map(prev);
      newMap.set(assignmentId, { status, quantity, notes, originalDate });
      return newMap;
    });
  };

  const handleBulkSave = async () => {
    if (modifiedTasks.size === 0) return;

    try {
      setSaving(true);
      
      // Update all modified tasks
      const updatePromises = Array.from(modifiedTasks.entries()).map(([assignmentId, data]) =>
        markTaskComplete(assignmentId, data.status, data.quantity, data.notes, data.originalDate)
      );

      await Promise.all(updatePromises);

      // Clear modified tasks after successful save
      setModifiedTasks(new Map());
    } catch (error: any) {
      console.error("Error saving tasks:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleIndividualUpdate = async (assignmentId: string, status: TaskStatus, quantity?: number, notes?: string, originalDate?: string) => {
    // Update immediately
    await markTaskComplete(assignmentId, status, quantity, notes, originalDate);
    
    // Remove from modified tasks after successful update
    setModifiedTasks((prev) => {
      const newMap = new Map(prev);
      newMap.delete(assignmentId);
      return newMap;
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header with Date and Greeting */}
      <div className="space-y-2">
        <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}
          {fullName && `, ${fullName.split(" ")[0]}`}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-muted-foreground text-base sm:text-lg">
            {format(today, "EEEE, dd MMM yyyy")}
          </p>
          {!workingDayInfo.isWorkingDay && (
            <Badge variant="secondary" className="bg-muted text-xs">
              {workingDayInfo.reason}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-primary">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-success">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Completed-late</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.completedLate}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-warning">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-secondary">{stats.completion}%</div>
            <Progress value={stats.completion} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Today's Tasks */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="font-heading flex items-center gap-2 text-lg sm:text-xl">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                Today's Tasks
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Track and complete your scheduled tasks</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {modifiedTasks.size > 0 && (
                <Button 
                  size="sm" 
                  onClick={handleBulkSave}
                  disabled={saving}
                  className="bg-primary text-xs sm:text-sm"
                >
                  {saving ? (
                    <>
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Save All </span>
                      ({modifiedTasks.size})
                    </>
                  )}
                </Button>
              )}
              <Button size="sm" onClick={onCreateTask} className="text-xs sm:text-sm">
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Add Task</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No tasks scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((dailyTask) => (
                <TaskItem
                  key={dailyTask.assignment.id}
                  dailyTask={dailyTask}
                  currentUserId={user.id}
                  isManager={isManager}
                  onStatusChange={handleTaskChange}
                  onIndividualUpdate={handleIndividualUpdate}
                  isModified={modifiedTasks.has(dailyTask.assignment.id)}
                  dependencies={dependenciesByTask[dailyTask.assignment.task.id] || []}
                  employeeName={
                    dailyTask.assignment.assigned_to === user.id
                      ? fullName || undefined
                      : employeeNames[dailyTask.assignment.assigned_to] || undefined
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending from Previous Days */}
      {pendingTasks.length > 0 && (
        <Card className="shadow-lg border-warning/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading flex items-center gap-2 text-warning">
                  <AlertCircle className="w-5 h-5" />
                  Pending from Previous Days
                </CardTitle>
                <CardDescription>Tasks that need your attention</CardDescription>
              </div>
              {Array.from(modifiedTasks.keys()).some(id => 
                pendingTasks.some(pt => pt.assignment.id === id)
              ) && (
                <Button 
                  size="sm" 
                  onClick={handleBulkSave}
                  disabled={saving}
                  className="bg-primary"
                >
                  {saving ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save All ({Array.from(modifiedTasks.keys()).filter(id => 
                        pendingTasks.some(pt => pt.assignment.id === id)
                      ).length})
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedPendingTasks.map((dailyTask) => (
                <PendingTaskItem
                  key={`${dailyTask.assignment.id}-${dailyTask.originalDate}`}
                  dailyTask={dailyTask}
                  currentUserId={user.id}
                  onStatusChange={handleTaskChange}
                  onIndividualUpdate={handleIndividualUpdate}
                  isModified={modifiedTasks.has(dailyTask.assignment.id)}
                  dependencies={dependenciesByTask[dailyTask.assignment.task.id] || []}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

interface TaskItemProps {
  dailyTask: {
    assignment: {
      id: string;
      assigned_to: string;
      assigner?: {
        id: string;
        full_name: string | null;
      } | null;
      task: {
        name: string;
        description: string | null;
        benchmark: number | null;
        category: string | null;
      };
    };
    status: TaskStatus;
    completion?: {
      id: string;
      quantity_completed: number | null;
      notes: string | null;
      status: TaskStatus;
      completion_date: string;
      scheduled_date: string;
      approval_status: string;
      manager_comment?: string | null;
    };
  };
  onStatusChange: (assignmentId: string, status: TaskStatus, quantity?: number, notes?: string) => void;
  onIndividualUpdate: (assignmentId: string, status: TaskStatus, quantity?: number, notes?: string) => void;
  isModified: boolean;
  currentUserId: string;
  isManager: boolean;
  dependencies: Array<{ id: string; name: string }>;
  employeeName?: string;
}

const TaskItem = ({ dailyTask, onStatusChange, onIndividualUpdate, isModified, currentUserId, isManager, dependencies, employeeName }: TaskItemProps) => {
  const { task } = dailyTask.assignment;
  const status = dailyTask.status;
  const [quantity, setQuantity] = useState<string>("");
  const [completionStatus, setCompletionStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  
  // Check if manager is viewing a subordinate's task (cannot edit, only approve/reject)
  const isSubordinateTask = isManager && dailyTask.assignment.assigned_to !== currentUserId;

  const hasBenchmark = task.benchmark !== null && task.benchmark > 1;
  const quantityNum = quantity ? parseFloat(quantity) : 0;

  // Auto-determine status based on quantity vs benchmark
  const derivedStatus: TaskStatus = hasBenchmark
    ? quantityNum >= task.benchmark!
      ? "completed"
      : quantityNum > 0
        ? "partial"
        : "not_done"
    : completionStatus === "completed"
      ? "completed"
      : completionStatus === "not_done"
        ? "not_done"
        : "not_done";

  const requiresNotes = derivedStatus === "not_done" || derivedStatus === "partial";
  const effectiveQuantity = hasBenchmark ? quantityNum : (completionStatus === "completed" ? 1 : undefined);

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />;
      case "partial":
        return <Clock className="w-5 h-5 text-warning flex-shrink-0" />;
      case "pending":
        return <Clock className="w-5 h-5 text-warning flex-shrink-0" />;
      case "delayed":
        return <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" />;
      case "not_done":
        return <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />;
      case "not_applicable":
        return <XCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
            Completed
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
            Partial ({dailyTask.completion?.quantity_completed || 0})
          </Badge>
        );
      case "delayed":
        return (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
            Delayed
          </Badge>
        );
      case "not_done":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
            Not Done
          </Badge>
        );
      case "not_applicable":
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            N/A
          </Badge>
        );
      default:
        return null;
    }
  };

  const getDerivedStatusBadge = () => {
    switch (derivedStatus) {
      case "completed":
        return <Badge className="bg-success/10 text-success border-success/30">Completed</Badge>;
      case "partial":
        return <Badge className="bg-warning/10 text-warning border-warning/30">Partial</Badge>;
      case "not_done":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Not Done</Badge>;
      default:
        return null;
    }
  };

  const canTakeAction = (status === "scheduled" || status === "pending") && !isSubordinateTask;

  // Track changes as user types (debounced)
  useEffect(() => {
    // Only track if we have some input
    if (!quantity && !completionStatus && !notes.trim()) {
      return;
    }

    // Don't track if validation would fail
    if (hasBenchmark && !quantity) {
      return;
    }
    if (requiresNotes && !notes.trim()) {
      return;
    }

    // Track the change
    const timeoutId = setTimeout(() => {
      onStatusChange(dailyTask.assignment.id, derivedStatus, effectiveQuantity, notes.trim() || undefined);
    }, 300); // Debounce for 300ms

    return () => clearTimeout(timeoutId);
  }, [quantity, completionStatus, notes, hasBenchmark, requiresNotes, derivedStatus, effectiveQuantity, dailyTask.assignment.id]);

  const handleSubmit = async (saveImmediately: boolean = false) => {
    setError("");

    // Validate quantity is required when benchmark exists
    if (hasBenchmark && !quantity) {
      setError("Quantity is required for tasks with a benchmark");
      return;
    }

    // Validate mandatory comments for incomplete/partial tasks
    if (requiresNotes && !notes.trim()) {
      setError("Comments are mandatory for incomplete or partial tasks");
      return;
    }

    if (saveImmediately) {
      // Save immediately and clear local state
      await onIndividualUpdate(dailyTask.assignment.id, derivedStatus, effectiveQuantity, notes.trim() || undefined);
      setQuantity("");
      setCompletionStatus("");
      setNotes("");
      setError("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  const handleApprove = async (comment?: string) => {
    if (!dailyTask.completion || !isManager) return;

    setIsApproving(true);
    try {
      const { error } = await supabase
        .from("task_completions")
        .update({
          approval_status: "approved",
          approved_by: currentUserId,
          manager_comment: comment || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dailyTask.completion.id);

      if (error) throw error;

      // Refresh the tasks to show updated approval status
      window.location.reload(); // Simple refresh for now, could be optimized later
    } catch (error: any) {
      console.error("Error approving task:", error);
      throw error;
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (comment: string) => {
    if (!dailyTask.completion || !isManager) return;

    setIsApproving(true);
    try {
      const { error } = await supabase
        .from("task_completions")
        .update({
          approval_status: "rejected",
          approved_by: currentUserId,
          manager_comment: comment,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dailyTask.completion.id);

      if (error) throw error;

      // Refresh the tasks to show updated approval status
      window.location.reload(); // Simple refresh for now, could be optimized later
    } catch (error: any) {
      console.error("Error rejecting task:", error);
      throw error;
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className={cn(
      "flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-all hover:shadow-md bg-card",
      isModified 
        ? "border-primary bg-primary/5" 
        : "border-border hover:border-primary/30"
    )}>
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-sm sm:text-base text-foreground">{task.name}</div>
            {task.category && (
              <Badge variant="secondary" className="text-xs">
                {task.category}
              </Badge>
            )}
          </div>
          {task.description && (
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">{task.description}</div>
          )}
          {task.benchmark && (
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Target: {task.benchmark}</div>
          )}
          {dependencies.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Link2 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs">Depends on:</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {dependencies.map((dep) => (
                  <Badge key={dep.id} variant="outline" className="text-xs">
                    {dep.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {canTakeAction ? (
        <div className="flex flex-col gap-3 flex-1 min-w-0 w-full sm:w-auto">
          {/* Work Done, Comments, and Save button - stacked on mobile */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
            {/* Work Done Field */}
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor={`work-done-${dailyTask.assignment.id}`} className="text-xs">
                Work Done {hasBenchmark && <span className="text-destructive">*</span>}
                {hasBenchmark && <span className="text-muted-foreground ml-1 hidden sm:inline">(Benchmark: {task.benchmark})</span>}
              </Label>
              {hasBenchmark ? (
                <Input
                  id={`work-done-${dailyTask.assignment.id}`}
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setError("");
                  }}
                  onKeyDown={handleKeyDown}
                  className="h-8"
                />
              ) : (
                <RadioGroup
                  value={completionStatus}
                  onValueChange={(value) => {
                    setCompletionStatus(value);
                    setError("");
                  }}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="completed" id={`work-done-completed-${dailyTask.assignment.id}`} />
                    <Label htmlFor={`work-done-completed-${dailyTask.assignment.id}`} className="text-xs font-normal cursor-pointer">
                      Task completed
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="not_done" id={`work-done-not-done-${dailyTask.assignment.id}`} />
                    <Label htmlFor={`work-done-not-done-${dailyTask.assignment.id}`} className="text-xs font-normal cursor-pointer">
                      Not completed
                    </Label>
                  </div>
                </RadioGroup>
              )}
            </div>

            {/* Comments Field */}
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor={`notes-${dailyTask.assignment.id}`} className="text-xs">
                Comments {requiresNotes && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id={`notes-${dailyTask.assignment.id}`}
                placeholder={requiresNotes ? "Please provide a reason (required)" : "Add any notes (optional)"}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] text-sm resize-none"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            {/* Submit Button */}
            <div className="flex items-end sm:flex-shrink-0">
              <Button
                size="sm"
                onClick={() => handleSubmit(true)}
                className="h-8 w-full sm:w-auto"
                variant={isModified ? "default" : "outline"}
              >
                {isModified ? "Update & Save" : "Update"}
              </Button>
            </div>
          </div>

          {/* Status Preview */}
          {(quantity || completionStatus) && (
            <div className="space-y-1">
              <Label className="text-xs">Status will be set as:</Label>
              <div className="flex items-center gap-2">
                {getDerivedStatusBadge()}
                {hasBenchmark && quantityNum > 0 && quantityNum < task.benchmark! && (
                  <span className="text-xs text-muted-foreground">
                    ({quantityNum}/{task.benchmark} = {Math.floor((quantityNum / task.benchmark!) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          {dailyTask.completion && (
            <>
              <TaskApprovalBadge
                approvalStatus={dailyTask.completion.approval_status as "pending" | "approved" | "rejected" | null}
              />
              {isSubordinateTask && dailyTask.completion.approval_status === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs"
                  onClick={() => setApprovalDialogOpen(true)}
                  disabled={isApproving}
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Review & Approve
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Approval Dialog for Managers */}
      {dailyTask.completion && (
        <TaskApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
          taskName={task.name}
          employeeName={employeeName || "Employee"}
          completionDate={format(new Date(dailyTask.completion.completion_date), "MMM dd, yyyy")}
          scheduledDate={format(new Date(dailyTask.completion.scheduled_date), "MMM dd, yyyy")}
          status={dailyTask.completion.status}
          quantity={dailyTask.completion.quantity_completed}
          employeeNotes={dailyTask.completion.notes}
          currentApprovalStatus={dailyTask.completion.approval_status as "pending" | "approved" | "rejected"}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
      
      {/* Read-only view for managers viewing subordinate tasks */}
      {isSubordinateTask && dailyTask.completion && (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Quantity:</span>
            <span className="font-medium">{dailyTask.completion.quantity_completed ?? "N/A"}</span>
          </div>
          {dailyTask.completion.notes && (
            <div>
              <span className="text-muted-foreground">Employee Notes:</span>
              <p className="mt-1 text-sm whitespace-pre-wrap bg-background p-2 rounded border">
                {dailyTask.completion.notes}
              </p>
            </div>
          )}
          {dailyTask.completion.manager_comment && (
            <div>
              <span className="text-muted-foreground">Manager Comment:</span>
              <p className="mt-1 text-sm whitespace-pre-wrap bg-background p-2 rounded border">
                {dailyTask.completion.manager_comment}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface PendingTaskItemProps {
  dailyTask: {
    assignment: {
      id: string;
      assigner?: {
        id: string;
        full_name: string | null;
      } | null;
      task: {
        name: string;
        description: string | null;
        benchmark: number | null;
      };
    };
    originalDate?: string;
  };
  onStatusChange: (assignmentId: string, status: TaskStatus, quantity?: number, notes?: string, originalDate?: string) => void;
  onIndividualUpdate: (assignmentId: string, status: TaskStatus, quantity?: number, notes?: string, originalDate?: string) => void;
  isModified: boolean;
  currentUserId: string;
  dependencies: Array<{ id: string; name: string }>;
}

const PendingTaskItem = ({ dailyTask, onStatusChange, onIndividualUpdate, isModified, currentUserId, dependencies }: PendingTaskItemProps) => {
  const { task } = dailyTask.assignment;
  const originalDate = dailyTask.originalDate;
  const [quantity, setQuantity] = useState<string>("");
  const [completionStatus, setCompletionStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const hasBenchmark = task.benchmark !== null && task.benchmark > 1;
  const quantityNum = quantity ? parseFloat(quantity) : 0;

  // Auto-determine status based on quantity vs benchmark
  const derivedStatus: TaskStatus = hasBenchmark
    ? quantityNum >= task.benchmark!
      ? "completed"
      : quantityNum > 0
        ? "partial"
        : "not_done"
    : completionStatus === "completed"
      ? "completed"
      : completionStatus === "not_done"
        ? "not_done"
        : "not_done";

  // Comments are mandatory for all pending/delayed tasks regardless of status
  const requiresNotes = true;
  const effectiveQuantity = hasBenchmark ? quantityNum : (completionStatus === "completed" ? 1 : undefined);

  const getDerivedStatusBadge = () => {
    switch (derivedStatus) {
      case "completed":
        return <Badge className="bg-success/10 text-success border-success/30">Completed</Badge>;
      case "partial":
        return <Badge className="bg-warning/10 text-warning border-warning/30">Partial</Badge>;
      case "not_done":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Not Done</Badge>;
      default:
        return null;
    }
  };

  // Track changes as user types (debounced)
  useEffect(() => {
    // Only track if we have some input
    if (!quantity && !completionStatus && !notes.trim()) {
      return;
    }

    // Don't track if validation would fail
    if (hasBenchmark && !quantity) {
      return;
    }
    if (requiresNotes && !notes.trim()) {
      return;
    }

    // Track the change
    const timeoutId = setTimeout(() => {
      onStatusChange(dailyTask.assignment.id, derivedStatus, effectiveQuantity, notes.trim() || undefined, dailyTask.originalDate);
    }, 300); // Debounce for 300ms

    return () => clearTimeout(timeoutId);
  }, [quantity, completionStatus, notes, hasBenchmark, requiresNotes, derivedStatus, effectiveQuantity, dailyTask.assignment.id, dailyTask.originalDate]);

  const handleSubmit = async (saveImmediately: boolean = false) => {
    setError("");

    // Validate quantity is required when benchmark exists
    if (hasBenchmark && !quantity) {
      setError("Quantity is required for tasks with a benchmark");
      return;
    }

    // Validate mandatory comments for delayed tasks (all pending tasks are delayed)
    if (requiresNotes && !notes.trim()) {
      setError("Comments are mandatory for delayed tasks");
      return;
    }

    if (saveImmediately) {
      // Save immediately and clear local state
      await onIndividualUpdate(dailyTask.assignment.id, derivedStatus, effectiveQuantity, notes.trim() || undefined, dailyTask.originalDate);
      setQuantity("");
      setCompletionStatus("");
      setNotes("");
      setError("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit(true); // Save immediately on Ctrl/Cmd+Enter
    }
  };

  return (
    <div className={cn(
      "flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border bg-warning/5",
      isModified 
        ? "border-primary bg-primary/5" 
        : "border-warning/30"
    )}>
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm sm:text-base text-foreground">{task.name}</div>
          {task.description && (
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">{task.description}</div>
          )}
          <div className="text-xs sm:text-sm text-muted-foreground mt-1">
            <span className="block sm:inline">Originally due: {originalDate ? format(new Date(originalDate), "MMM dd, yyyy") : ""}</span>
            {originalDate && (
              <span className="block sm:inline sm:ml-1">
                {" · "}
                {formatDistanceToNow(new Date(originalDate), { addSuffix: true })}
              </span>
            )}
          </div>
          {dependencies.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Link2 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs">Depends on:</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {dependencies.map((dep) => (
                  <Badge key={dep.id} variant="outline" className="text-xs">
                    {dep.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 flex-1 min-w-0 w-full sm:w-auto">
        {/* Work Done, Comments, and Save button - stacked on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
          {/* Work Done Field */}
          <div className="space-y-2 flex-1 min-w-0">
            <Label htmlFor={`work-done-pending-${dailyTask.assignment.id}`} className="text-xs">
              Work Done {hasBenchmark && <span className="text-destructive">*</span>}
              {hasBenchmark && <span className="text-muted-foreground ml-1 hidden sm:inline">(Benchmark: {task.benchmark})</span>}
            </Label>
            {hasBenchmark ? (
              <Input
                id={`work-done-pending-${dailyTask.assignment.id}`}
                type="number"
                step="0.5"
                min="0"
                placeholder="Enter quantity"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                className="h-8"
              />
              ) : (
                <RadioGroup
                  value={completionStatus}
                  onValueChange={(value) => {
                    setCompletionStatus(value);
                    setError("");
                  }}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="completed" id={`work-done-completed-pending-${dailyTask.assignment.id}`} />
                    <Label htmlFor={`work-done-completed-pending-${dailyTask.assignment.id}`} className="text-xs font-normal cursor-pointer">
                      Task completed
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="not_done" id={`work-done-not-done-pending-${dailyTask.assignment.id}`} />
                    <Label htmlFor={`work-done-not-done-pending-${dailyTask.assignment.id}`} className="text-xs font-normal cursor-pointer">
                      Not completed
                    </Label>
                  </div>
                </RadioGroup>
              )}
          </div>

          {/* Comments Field */}
          <div className="space-y-2 flex-1 min-w-0">
            <Label htmlFor={`notes-pending-${dailyTask.assignment.id}`} className="text-xs">
              Comments <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={`notes-pending-${dailyTask.assignment.id}`}
              placeholder="Comments are mandatory for delayed tasks (required)"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] text-sm resize-none"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Submit Button */}
          <div className="flex items-end sm:flex-shrink-0">
            <Button
              size="sm"
              onClick={() => handleSubmit(true)}
              className="h-8 w-full sm:w-auto"
              variant={isModified ? "default" : "outline"}
            >
              {isModified ? "Update & Save" : "Update"}
            </Button>
          </div>
        </div>

        {/* Status Preview */}
        {(quantity || completionStatus) && (
          <div className="space-y-1">
            <Label className="text-xs">Status will be set as:</Label>
            <div className="flex items-center gap-2">
              {getDerivedStatusBadge()}
              {hasBenchmark && quantityNum > 0 && quantityNum < task.benchmark! && (
                <span className="text-xs text-muted-foreground">
                  ({quantityNum}/{task.benchmark} = {Math.floor((quantityNum / task.benchmark!) * 100)}%)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyView;