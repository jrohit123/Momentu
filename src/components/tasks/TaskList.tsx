import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Repeat, Target, Edit, Trash2, Plus, UserPlus, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { TaskAssignDialog } from "./TaskAssignDialog";
import { TaskCreateDialog } from "./TaskCreateDialog";
import { DelegationTypeBadge } from "./DelegationTypeBadge";

interface Task {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  benchmark: number | null;
  recurrence_type: string;
  recurrence_config: any;
  is_active: boolean;
  created_at: string;
}

interface TaskListProps {
  user: User;
  onCreateClick: () => void;
}

export const TaskList = ({ user, onCreateClick }: TaskListProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [assignmentsByTask, setAssignmentsByTask] = useState<Record<string, Array<{ assigned_to: string; delegation_type: string | null; assigned_by: string }>>>({});
  const { toast } = useToast();

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("created_by", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks(data || []);

      // Fetch assignment counts and details for each task
      if (data && data.length > 0) {
        const { data: assignments, error: assignError } = await supabase
          .from("task_assignments")
          .select("task_id, assigned_to, delegation_type, assigned_by")
          .in("task_id", data.map((t) => t.id));

        if (!assignError && assignments) {
          const counts: Record<string, number> = {};
          const assignmentsMap: Record<string, Array<{ assigned_to: string; delegation_type: string | null; assigned_by: string }>> = {};

          assignments.forEach((a) => {
            counts[a.task_id] = (counts[a.task_id] || 0) + 1;
            if (!assignmentsMap[a.task_id]) {
              assignmentsMap[a.task_id] = [];
            }
            assignmentsMap[a.task_id].push({
              assigned_to: a.assigned_to,
              delegation_type: a.delegation_type,
              assigned_by: a.assigned_by,
            });
          });
          setAssignmentCounts(counts);
          setAssignmentsByTask(assignmentsMap);
        }
      }
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

  useEffect(() => {
    fetchTasks();
  }, [user.id]);

  const handleAssignClick = (task: Task) => {
    setSelectedTask(task);
    setAssignDialogOpen(true);
  };

  const handleEditClick = (task: Task) => {
    setSelectedTask(task);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;

    try {
      // Check if task has assignments
      const { data: assignments, error: assignCheckError } = await supabase
        .from("task_assignments")
        .select("id")
        .eq("task_id", taskToDelete.id)
        .limit(1);

      if (assignCheckError) throw assignCheckError;

      if (assignments && assignments.length > 0) {
        // Soft delete: set is_active to false instead of hard delete
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ is_active: false })
          .eq("id", taskToDelete.id)
          .eq("created_by", user.id);

        if (updateError) throw updateError;

        toast({
          title: "Task deactivated",
          description: "Task has been deactivated. Existing assignments are preserved.",
        });
      } else {
        // Hard delete: no assignments, safe to delete
        const { error: deleteError } = await supabase
          .from("tasks")
          .delete()
          .eq("id", taskToDelete.id)
          .eq("created_by", user.id);

        if (deleteError) throw deleteError;

        toast({
          title: "Task deleted",
          description: "Task has been permanently deleted.",
        });
      }

      setDeleteDialogOpen(false);
      setTaskToDelete(null);
      fetchTasks();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getRecurrenceLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      none: "One-time",
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      yearly: "Yearly",
      custom: "Custom",
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <Calendar className="w-16 h-16 text-muted-foreground/50" />
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-lg">No Tasks Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create your first task to start tracking daily progress and team momentum
            </p>
          </div>
          <Button onClick={onCreateClick} className="mt-4">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Task
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold">Your Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {tasks.length} active {tasks.length === 1 ? "task" : "tasks"}
          </p>
        </div>
        <Button onClick={onCreateClick}>
          <Plus className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </div>

      <div className="grid gap-4">
        {tasks.map((task) => (
          <Card key={task.id} className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{task.name}</CardTitle>
                    {task.category && (
                      <Badge variant="secondary" className="text-xs">
                        {task.category}
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <CardDescription className="text-sm">
                      {task.description}
                    </CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => handleAssignClick(task)}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Assign
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEditClick(task)}
                    title="Edit task"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDeleteClick(task)}
                    title="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Repeat className="w-4 h-4" />
                  <span>{getRecurrenceLabel(task.recurrence_type)}</span>
                </div>
                {task.benchmark && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Target className="w-4 h-4" />
                    <span>Target: {task.benchmark}</span>
                  </div>
                )}
                {assignmentCounts[task.id] > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{assignmentCounts[task.id]} assigned</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {assignmentsByTask[task.id]?.map((assignment, idx) => (
                        <DelegationTypeBadge
                          key={`${assignment.assigned_to}-${idx}`}
                          delegationType={assignment.delegation_type as any}
                          showIcon={true}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <TaskAssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        task={selectedTask}
        userId={user.id}
        onSuccess={fetchTasks}
      />

      <TaskCreateDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        taskToEdit={selectedTask}
        onSuccess={() => {
          fetchTasks();
          setSelectedTask(null);
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {taskToDelete && (
                <>
                  This will {assignmentCounts[taskToDelete.id] > 0 ? "deactivate" : "permanently delete"} the task{" "}
                  <span className="font-semibold text-foreground">"{taskToDelete.name}"</span>.
                  {assignmentCounts[taskToDelete.id] > 0 && (
                    <span className="block mt-2">
                      The task has {assignmentCounts[taskToDelete.id]} assignment(s) and will be deactivated instead of deleted to preserve history.
                    </span>
                  )}
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {taskToDelete && assignmentCounts[taskToDelete.id] > 0 ? "Deactivate" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
