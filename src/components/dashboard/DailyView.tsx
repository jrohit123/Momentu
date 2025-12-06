import { useState, useMemo } from "react";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import { useWorkingDays } from "@/hooks/useWorkingDays";
import { TaskCompletionDialog } from "@/components/tasks/TaskCompletionDialog";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface DailyViewProps {
  user: User;
  onCreateTask?: () => void;
}

const DailyView = ({ user, onCreateTask }: DailyViewProps) => {
  const [today] = useState(new Date());
  const { tasks, pendingTasks, loading, markTaskComplete } = useDailyTasks(user.id, today);
  const { isWorkingDay } = useWorkingDays(user.id);
  
  const workingDayInfo = isWorkingDay(today);

  const stats = useMemo(() => {
    const completed = tasks.filter(t => t.status === "completed").length;
    const total = tasks.length;
    const pending = pendingTasks.length;
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, pending, completion };
  }, [tasks, pendingTasks]);

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
    <div className="space-y-6 animate-fade-in">
      {/* Header with Date and Greeting */}
      <div className="space-y-2">
        <h2 className="font-heading text-3xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}
        </h2>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-lg">
            {format(today, "EEEE, dd MMM yyyy")}
          </p>
          {!workingDayInfo.isWorkingDay && (
            <Badge variant="secondary" className="bg-muted">
              {workingDayInfo.reason}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-secondary">{stats.completion}%</div>
            <Progress value={stats.completion} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Today's Tasks */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                Today's Tasks
              </CardTitle>
              <CardDescription>Track and complete your scheduled tasks</CardDescription>
            </div>
            <Button size="sm" onClick={onCreateTask}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
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
              {tasks.map((dailyTask) => (
                <TaskItem
                  key={dailyTask.assignment.id}
                  dailyTask={dailyTask}
                  onStatusChange={(status, quantity, notes) =>
                    markTaskComplete(dailyTask.assignment.id, status, quantity, notes)
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
            <CardTitle className="font-heading flex items-center gap-2 text-warning">
              <AlertCircle className="w-5 h-5" />
              Pending from Previous Days
            </CardTitle>
            <CardDescription>Tasks that need your attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingTasks.map((dailyTask) => (
                <PendingTaskItem
                  key={`${dailyTask.assignment.id}-${dailyTask.originalDate}`}
                  dailyTask={dailyTask}
                  onComplete={(status, quantity, notes) =>
                    markTaskComplete(
                      dailyTask.assignment.id,
                      status,
                      quantity,
                      notes,
                      dailyTask.originalDate
                    )
                  }
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
      task: {
        name: string;
        description: string | null;
        benchmark: number | null;
        category: string | null;
      };
    };
    status: TaskStatus;
    completion?: {
      quantity_completed: number | null;
    };
  };
  onStatusChange: (status: TaskStatus, quantity?: number, notes?: string) => void;
}

const TaskItem = ({ dailyTask, onStatusChange }: TaskItemProps) => {
  const { task } = dailyTask.assignment;
  const status = dailyTask.status;
  const [dialogOpen, setDialogOpen] = useState(false);

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />;
      case "partial":
        return <Clock className="w-5 h-5 text-warning flex-shrink-0" />;
      case "pending":
        return <Clock className="w-5 h-5 text-warning flex-shrink-0" />;
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

  const canTakeAction = status === "scheduled" || status === "pending";

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/30 transition-all hover:shadow-md bg-card">
      <div className="flex items-center gap-3 flex-1">
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium text-foreground">{task.name}</div>
            {task.category && (
              <Badge variant="secondary" className="text-xs">
                {task.category}
              </Badge>
            )}
          </div>
          {task.description && (
            <div className="text-sm text-muted-foreground">{task.description}</div>
          )}
          {task.benchmark && (
            <div className="text-sm text-muted-foreground">Target: {task.benchmark}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {canTakeAction ? (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={() => setDialogOpen(true)}
            >
              Update Status
            </Button>
            <TaskCompletionDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              taskName={task.name}
              benchmark={task.benchmark}
              onSubmit={(status, quantity, notes) => {
                onStatusChange(status, quantity, notes);
              }}
            />
          </>
        ) : (
          getStatusBadge()
        )}
      </div>
    </div>
  );
};

interface PendingTaskItemProps {
  dailyTask: {
    assignment: {
      task: {
        name: string;
        description: string | null;
        benchmark: number | null;
      };
    };
    originalDate?: string;
  };
  onComplete: (status: TaskStatus, quantity?: number, notes?: string) => void;
}

const PendingTaskItem = ({ dailyTask, onComplete }: PendingTaskItemProps) => {
  const { task } = dailyTask.assignment;
  const originalDate = dailyTask.originalDate;
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-warning/30 bg-warning/5">
      <div className="flex items-center gap-3 flex-1">
        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
        <div>
          <div className="font-medium text-foreground">{task.name}</div>
          {task.description && (
            <div className="text-sm text-muted-foreground">{task.description}</div>
          )}
          <div className="text-sm text-muted-foreground">
            Originally due: {originalDate ? format(new Date(originalDate), "MMM dd, yyyy") : ""}
            {" · "}
            {originalDate ? formatDistanceToNow(new Date(originalDate), { addSuffix: true }) : ""}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="default"
        onClick={() => setDialogOpen(true)}
      >
        Update Status
      </Button>
      <TaskCompletionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        taskName={task.name}
        benchmark={task.benchmark}
        onSubmit={(status, quantity, notes) => {
          onComplete(status, quantity, notes);
        }}
      />
    </div>
  );
};

export default DailyView;