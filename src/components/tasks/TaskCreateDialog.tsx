import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Edit } from "lucide-react";
import { RecurrenceConfig } from "./RecurrenceConfig";

const taskSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(200, "Task name must be less than 200 characters"),
  description: z.string().trim().max(1000, "Description must be less than 1000 characters").optional(),
  category: z.string().trim().max(100).optional(),
  benchmark: z.number().positive("Benchmark must be positive").optional().nullable(),
  recurrence_type: z.enum(["none", "daily", "weekly", "monthly", "yearly", "custom"]),
  recurrence_config: z.any().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

interface Task {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  benchmark: number | null;
  recurrence_type: string;
  recurrence_config: any;
}

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  taskToEdit?: Task | null;
}

export const TaskCreateDialog = ({ open, onOpenChange, onSuccess, taskToEdit }: TaskCreateDialogProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditMode = !!taskToEdit;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      benchmark: undefined,
      recurrence_type: "none",
      recurrence_config: null,
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (taskToEdit && open) {
      form.reset({
        name: taskToEdit.name,
        description: taskToEdit.description || "",
        category: taskToEdit.category || "",
        benchmark: taskToEdit.benchmark || undefined,
        recurrence_type: taskToEdit.recurrence_type as any,
        recurrence_config: taskToEdit.recurrence_config,
      });
    } else if (!taskToEdit && open) {
      form.reset({
        name: "",
        description: "",
        category: "",
        benchmark: undefined,
        recurrence_type: "none",
        recurrence_config: null,
      });
    }
  }, [taskToEdit, open, form]);

  const onSubmit = async (values: TaskFormValues) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to perform this action",
          variant: "destructive",
        });
        return;
      }

      if (isEditMode && taskToEdit) {
        // Update existing task
        const { error: updateError } = await supabase
          .from("tasks")
          .update({
            name: values.name,
            description: values.description || null,
            category: values.category || null,
            benchmark: values.benchmark || null,
            recurrence_type: values.recurrence_type,
            recurrence_config: values.recurrence_config || null,
          })
          .eq("id", taskToEdit.id)
          .eq("created_by", user.id); // Ensure user owns the task

        if (updateError) throw updateError;

        toast({
          title: "Success!",
          description: "Task updated successfully",
        });
      } else {
        // Create new task
        const { data: taskData, error: taskError } = await supabase
          .from("tasks")
          .insert({
            name: values.name,
            description: values.description || null,
            category: values.category || null,
            benchmark: values.benchmark || null,
            recurrence_type: values.recurrence_type,
            recurrence_config: values.recurrence_config || null,
            created_by: user.id,
          })
          .select()
          .single();

        if (taskError) throw taskError;

        // Auto-assign the task to the creator
        const { error: assignError } = await supabase
          .from("task_assignments")
          .insert({
            task_id: taskData.id,
            assigned_to: user.id,
            assigned_by: user.id,
          });

        if (assignError) throw assignError;

        toast({
          title: "Success!",
          description: "Task created and assigned to you",
        });
      }

      form.reset();
      onOpenChange(false);
      onSuccess();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditMode ? (
              <>
                <Edit className="w-5 h-5 text-primary" />
                Edit Task
              </>
            ) : (
              <>
                <Calendar className="w-5 h-5 text-primary" />
                Create New Task
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update task details, recurrence patterns, and benchmarks"
              : "Define a task with recurrence patterns and benchmarks for your team"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sales Calls, Report Submission" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional details about this task..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sales, Operations" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="benchmark"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Benchmark (Target)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 10"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormDescription>Daily target quantity</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="recurrence_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurrence *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select recurrence pattern" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Does not repeat</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <RecurrenceConfig 
              recurrenceType={form.watch("recurrence_type")}
              value={form.watch("recurrence_config")}
              onChange={(config) => form.setValue("recurrence_config", config)}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditMode ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  isEditMode ? "Update Task" : "Create Task"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
