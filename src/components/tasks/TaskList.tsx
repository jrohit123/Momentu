import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Calendar, Repeat, Target, Edit, Trash2, Plus, UserPlus, Users, CheckSquare, Square, Link2, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import { TaskAssignDialog } from "./TaskAssignDialog";
import { TaskCreateDialog } from "./TaskCreateDialog";
import { DelegationTypeBadge } from "./DelegationTypeBadge";
import { BulkAssignDialog } from "./BulkAssignDialog";
import { BulkUpdateDialog } from "./BulkUpdateDialog";
import { ExcelUploadDialog } from "./ExcelUploadDialog";

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
  const [dependenciesByTask, setDependenciesByTask] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = useState(false);
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [excelUploadDialogOpen, setExcelUploadDialogOpen] = useState(false);
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

        // Fetch dependencies for each task
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
          .in("task_id", data.map((t) => t.id));

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

  const handleSelectAll = () => {
    if (selectedTaskIds.size === tasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const handleTaskSelect = (taskId: string) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;

    try {
      const taskIds = Array.from(selectedTaskIds);
      
      // Check which tasks have assignments
      const { data: assignments, error: assignCheckError } = await supabase
        .from("task_assignments")
        .select("task_id")
        .in("task_id", taskIds);

      if (assignCheckError) throw assignCheckError;

      const tasksWithAssignments = new Set(assignments?.map((a) => a.task_id) || []);
      const tasksToDeactivate = taskIds.filter((id) => tasksWithAssignments.has(id));
      const tasksToDelete = taskIds.filter((id) => !tasksWithAssignments.has(id));

      // Deactivate tasks with assignments
      if (tasksToDeactivate.length > 0) {
        const { error: updateError } = await supabase
          .from("tasks")
          .update({ is_active: false })
          .in("id", tasksToDeactivate)
          .eq("created_by", user.id);

        if (updateError) throw updateError;
      }

      // Delete tasks without assignments
      if (tasksToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("tasks")
          .delete()
          .in("id", tasksToDelete)
          .eq("created_by", user.id);

        if (deleteError) throw deleteError;
      }

      toast({
        title: "Tasks processed",
        description: `${tasksToDeactivate.length > 0 ? `${tasksToDeactivate.length} task(s) deactivated. ` : ""}${tasksToDelete.length > 0 ? `${tasksToDelete.length} task(s) deleted.` : ""}`,
      });

      setSelectedTaskIds(new Set());
      fetchTasks();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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

  const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-heading font-bold">Your Tasks</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {tasks.length} active {tasks.length === 1 ? "task" : "tasks"}
            {selectedTaskIds.size > 0 && (
              <span className="ml-2 text-primary font-medium">
                • {selectedTaskIds.size} selected
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedTaskIds.size > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => setBulkAssignDialogOpen(true)}
                size="sm"
                className="text-xs sm:text-sm"
              >
                <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Assign </span>
                ({selectedTaskIds.size})
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkUpdateDialogOpen(true)}
                size="sm"
                className="text-xs sm:text-sm"
              >
                <Edit className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Update </span>
                ({selectedTaskIds.size})
              </Button>
              <Button
                variant="outline"
                onClick={handleBulkDelete}
                size="sm"
                className="text-destructive hover:text-destructive text-xs sm:text-sm"
              >
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Delete </span>
                ({selectedTaskIds.size})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTaskIds(new Set())}
                className="text-xs sm:text-sm"
              >
                Clear
              </Button>
            </>
          )}
          <Button 
            onClick={() => setExcelUploadDialogOpen(true)} 
            size="sm" 
            variant="outline"
            className="text-xs sm:text-sm"
          >
            <FileSpreadsheet className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">Upload Excel</span>
            <span className="sm:hidden">Upload</span>
          </Button>
          <Button onClick={onCreateClick} size="sm" className="text-xs sm:text-sm">
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">Create Task</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {tasks.length > 0 && (
          <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-8"
            >
              {selectedTaskIds.size === tasks.length ? (
                <CheckSquare className="w-4 h-4 mr-2" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              {selectedTaskIds.size === tasks.length ? "Deselect All" : "Select All"}
            </Button>
          </div>
        )}
        {tasks.map((task) => (
          <Card 
            key={task.id} 
            className={cn(
              "hover:border-primary/50 transition-colors",
              selectedTaskIds.has(task.id) && "border-primary bg-primary/5"
            )}
          >
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                  <Checkbox
                    checked={selectedTaskIds.has(task.id)}
                    onCheckedChange={() => handleTaskSelect(task.id)}
                    className="mt-1 flex-shrink-0"
                  />
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base sm:text-lg">{task.name}</CardTitle>
                      {task.category && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {task.category}
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <CardDescription className="text-xs sm:text-sm line-clamp-2">
                        {task.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 sm:flex-initial text-xs sm:text-sm"
                    onClick={() => handleAssignClick(task)}
                  >
                    <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Assign</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => handleEditClick(task)}
                    title="Edit task"
                  >
                    <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive flex-shrink-0"
                    onClick={() => handleDeleteClick(task)}
                    title="Delete task"
                  >
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm">
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
                {dependenciesByTask[task.id] && dependenciesByTask[task.id].length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Link2 className="w-4 h-4" />
                      <span className="text-xs sm:text-sm">Depends on:</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {dependenciesByTask[task.id].map((dep) => (
                        <Badge key={dep.id} variant="outline" className="text-xs">
                          {dep.name}
                        </Badge>
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

      <BulkAssignDialog
        open={bulkAssignDialogOpen}
        onOpenChange={setBulkAssignDialogOpen}
        tasks={selectedTasks}
        userId={user.id}
        onSuccess={() => {
          fetchTasks();
          setSelectedTaskIds(new Set());
        }}
      />

      <BulkUpdateDialog
        open={bulkUpdateDialogOpen}
        onOpenChange={setBulkUpdateDialogOpen}
        tasks={selectedTasks}
        userId={user.id}
        onSuccess={() => {
          fetchTasks();
          setSelectedTaskIds(new Set());
        }}
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

      <ExcelUploadDialog
        open={excelUploadDialogOpen}
        onOpenChange={setExcelUploadDialogOpen}
        currentUserId={user.id}
        onSuccess={() => {
          fetchTasks();
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
