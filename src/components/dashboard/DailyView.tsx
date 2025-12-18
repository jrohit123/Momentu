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
import { Plus, Clock, CheckCircle, XCircle, AlertCircle, Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import { useWorkingDays } from "@/hooks/useWorkingDays";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface DailyViewProps {
  user: User;
  onCreateTask?: () => void;
}

const DailyView = ({ user, onCreateTask }: DailyViewProps) => {
  const [today] = useState(new Date());
  const [fullName, setFullName] = useState<string | null>(null);
  const { tasks, pendingTasks, loading, markTaskComplete } = useDailyTasks(user.id, today);
  const { isWorkingDay } = useWorkingDays(user.id);
  
  const workingDayInfo = isWorkingDay(today);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .single();
      
      if (data?.full_name) {
        setFullName(data.full_name);
      }
    };

    fetchUserProfile();
  }, [user.id]);

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
          {fullName && `, ${fullName}`}
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
                  currentUserId={user.id}
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
                  currentUserId={user.id}
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
      id: string;
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
      quantity_completed: number | null;
    };
  };
  onStatusChange: (status: TaskStatus, quantity?: number, notes?: string) => void;
  currentUserId: string;
}

const TaskItem = ({ dailyTask, onStatusChange, currentUserId }: TaskItemProps) => {
  const { task } = dailyTask.assignment;
  const status = dailyTask.status;
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

  const canTakeAction = status === "scheduled" || status === "pending";

  const handleSubmit = () => {
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

    onStatusChange(derivedStatus, effectiveQuantity, notes.trim() || undefined);
    
    // Reset form
    setQuantity("");
    setCompletionStatus("");
    setNotes("");
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/30 transition-all hover:shadow-md bg-card">
      <div className="flex items-center gap-3 flex-1 min-w-0 w-2/3">
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
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
      {canTakeAction ? (
        <div className="flex flex-col gap-3 flex-1 min-w-0 w-1/3">
          {/* Work Done, Comments, and Save button in one line */}
          <div className="flex items-start gap-3">
            {/* Work Done Field */}
            <div className="space-y-2 flex-1">
              <Label htmlFor={`work-done-${dailyTask.assignment.id}`} className="text-xs">
                Work Done {hasBenchmark && <span className="text-destructive">*</span>}
                {hasBenchmark && <span className="text-muted-foreground ml-1">(Benchmark: {task.benchmark})</span>}
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
            <div className="space-y-2 flex-1">
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
                className="min-h-[60px] text-sm"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            {/* Submit Button */}
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                className="h-8"
              >
                Save
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
  onComplete: (status: TaskStatus, quantity?: number, notes?: string) => void;
  currentUserId: string;
}

const PendingTaskItem = ({ dailyTask, onComplete, currentUserId }: PendingTaskItemProps) => {
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

  const requiresNotes = derivedStatus === "not_done" || derivedStatus === "partial";
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

  const handleSubmit = () => {
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

    onComplete(derivedStatus, effectiveQuantity, notes.trim() || undefined);
    
    // Reset form
    setQuantity("");
    setCompletionStatus("");
    setNotes("");
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-warning/30 bg-warning/5">
      <div className="flex items-center gap-3 flex-1 min-w-0 w-2/3">
        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
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
      <div className="flex flex-col gap-3 flex-1 min-w-0 w-1/3">
        {/* Work Done, Comments, and Save button in one line */}
        <div className="flex items-start gap-3">
          {/* Work Done Field */}
          <div className="space-y-2 flex-1">
            <Label htmlFor={`work-done-pending-${dailyTask.assignment.id}`} className="text-xs">
              Work Done {hasBenchmark && <span className="text-destructive">*</span>}
              {hasBenchmark && <span className="text-muted-foreground ml-1">(Benchmark: {task.benchmark})</span>}
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
          <div className="space-y-2 flex-1">
            <Label htmlFor={`notes-pending-${dailyTask.assignment.id}`} className="text-xs">
              Comments {requiresNotes && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={`notes-pending-${dailyTask.assignment.id}`}
              placeholder={requiresNotes ? "Please provide a reason (required)" : "Add any notes (optional)"}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] text-sm"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Submit Button */}
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              className="h-8"
            >
              Save
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