import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Edit, User, Users, AlertCircle, Link2 } from "lucide-react";
import { RecurrenceConfig } from "./RecurrenceConfig";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { DelegationTypeBadge } from "./DelegationTypeBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Array<{ id: string; name: string }>>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [dependencySearchQuery, setDependencySearchQuery] = useState("");
  const [dependencySearchOpen, setDependencySearchOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ manager_id: string | null; organization_id: string } | null>(null);
  const [delegationTypes, setDelegationTypes] = useState<Map<string, "self" | "downward" | "peer" | "upward">>(new Map());
  const [managerCheckResults, setManagerCheckResults] = useState<Map<string, boolean>>(new Map());
  const { toast } = useToast();
  const isEditMode = !!taskToEdit;

  // Get current user ID
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        setUserLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
        }
      } catch (error) {
        console.error("Error getting user:", error);
      } finally {
        setUserLoading(false);
      }
    };
    if (open) {
      getUser();
    }
  }, [open]);

  // Call hooks unconditionally (React requirement) but with safe defaults
  const { members: organizationMembers = [], loading: membersLoading } = useOrganizationMembers(userProfile?.organization_id || null);
  const { settings: systemSettings, loading: settingsLoading } = useSystemSettings(userProfile?.organization_id || null);
  
  // Provide safe defaults for systemSettings
  const safeSystemSettings = systemSettings || {
    timezone: "Asia/Kolkata",
    date_format: "YYYY-MM-DD",
    allow_upward_delegation: false,
  };

  // Search state for autocomplete
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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

  // Fetch user profile when dialog opens
  useEffect(() => {
    if (open && currentUserId) {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase
            .from("users")
            .select("manager_id, organization_id")
            .eq("id", currentUserId)
            .single();

          if (!error && data) {
            setUserProfile(data);
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
      };
      fetchProfile();
    } else {
      setUserProfile(null);
      setSelectedAssignees([]);
      setSearchQuery("");
      setSearchOpen(false);
    }
  }, [open, currentUserId]);

  // Calculate delegation types for organization members
  useEffect(() => {
    if (!userProfile || settingsLoading || !currentUserId || !organizationMembers.length) {
      setManagerCheckResults(new Map());
      setDelegationTypes(new Map());
      return;
    }

    const checkRelationships = async () => {
      try {
        const managerResults = new Map<string, boolean>();
        const delegationTypeMap = new Map<string, "self" | "downward" | "peer" | "upward">();
        
        for (const member of organizationMembers) {
          if (member.id === currentUserId) {
            managerResults.set(member.id, false);
            delegationTypeMap.set(member.id, "self");
            continue;
          }

          try {
            const { data: isManager } = await supabase.rpc("is_manager_of", {
              _manager_id: member.id,
              _subordinate_id: currentUserId,
            });

            managerResults.set(member.id, isManager || false);

            if (isManager) {
              delegationTypeMap.set(member.id, "upward");
            } else {
              const { data: isSubordinate } = await supabase.rpc("is_manager_of", {
                _manager_id: currentUserId,
                _subordinate_id: member.id,
              });

              if (isSubordinate) {
                delegationTypeMap.set(member.id, "downward");
              } else {
                delegationTypeMap.set(member.id, "peer");
              }
            }
          } catch (error) {
            console.error(`Error checking relationship for ${member.id}:`, error);
            // Default to peer if there's an error
            delegationTypeMap.set(member.id, "peer");
          }
        }

        setManagerCheckResults(managerResults);
        setDelegationTypes(delegationTypeMap);
      } catch (error) {
        console.error("Error in checkRelationships:", error);
      }
    };

    checkRelationships();
  }, [organizationMembers, currentUserId, userProfile, settingsLoading]);

  // Filter searchable members based on upward delegation setting and search query
  const searchableMembers = useMemo(() => {
    if (settingsLoading || !currentUserId) return [];

    let filtered = organizationMembers.filter((member) => {
      if (member.id === currentUserId) return true;
      if (!safeSystemSettings.allow_upward_delegation) {
        const isManager = managerCheckResults.get(member.id);
        if (isManager) return false;
      }
      return true;
    });

    // Filter by search query (minimum 3 characters)
    if (searchQuery.length >= 3) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((member) => 
        member.full_name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
      );
    } else {
      // If less than 3 characters, return empty array
      filtered = [];
    }

    return filtered;
  }, [organizationMembers, currentUserId, safeSystemSettings.allow_upward_delegation, settingsLoading, managerCheckResults, searchQuery]);

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
      // Load existing assignments and dependencies for edit mode
      loadExistingAssignments();
      loadExistingDependencies();
    } else if (!taskToEdit && open) {
      form.reset({
        name: "",
        description: "",
        category: "",
        benchmark: undefined,
        recurrence_type: "none",
        recurrence_config: null,
      });
      // Reset assignees and dependencies for new tasks
      setSelectedAssignees([]);
      setSelectedDependencies([]);
    }
  }, [taskToEdit, open, form]);

  const loadExistingAssignments = async () => {
    if (!taskToEdit) return;
    try {
      const { data, error } = await supabase
        .from("task_assignments")
        .select("assigned_to")
        .eq("task_id", taskToEdit.id);

      if (!error && data) {
        setSelectedAssignees(data.map((a) => a.assigned_to));
      }
    } catch (error) {
      console.error("Error loading assignments:", error);
    }
  };

  const loadExistingDependencies = async () => {
    if (!taskToEdit) return;
    try {
      const { data, error } = await supabase
        .from("task_dependencies")
        .select("depends_on_task_id")
        .eq("task_id", taskToEdit.id);

      if (!error && data) {
        setSelectedDependencies(data.map((d) => d.depends_on_task_id));
      }
    } catch (error) {
      console.error("Error loading dependencies:", error);
    }
  };

  // Fetch available tasks for dependency selection
  const fetchAvailableTasks = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setDependenciesLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, name")
        .eq("created_by", currentUserId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;

      // Filter out current task if editing
      const filtered = taskToEdit
        ? (data || []).filter((t) => t.id !== taskToEdit.id)
        : (data || []);

      setAvailableTasks(filtered);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load available tasks",
        variant: "destructive",
      });
    } finally {
      setDependenciesLoading(false);
    }
  }, [currentUserId, taskToEdit?.id, toast]);

  // Fetch available tasks when dialog opens
  useEffect(() => {
    if (open && currentUserId) {
      fetchAvailableTasks();
    }
  }, [open, currentUserId, fetchAvailableTasks]);

  // Filter tasks based on search query
  const filteredDependencyTasks = useMemo(() => {
    if (dependencySearchQuery.length < 2) {
      return availableTasks.filter((t) => !selectedDependencies.includes(t.id));
    }
    const query = dependencySearchQuery.toLowerCase();
    return availableTasks.filter(
      (t) =>
        !selectedDependencies.includes(t.id) &&
        t.name.toLowerCase().includes(query)
    );
  }, [availableTasks, selectedDependencies, dependencySearchQuery]);

  const handleDependencyToggle = (taskId: string) => {
    setSelectedDependencies((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleAssigneeToggle = (memberId: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

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

        // Update assignments if changed
        if (selectedAssignees.length > 0) {
          // Get current assignments
          const { data: currentAssignments } = await supabase
            .from("task_assignments")
            .select("assigned_to")
            .eq("task_id", taskToEdit.id);

          const currentAssigneeIds = currentAssignments?.map((a) => a.assigned_to) || [];
          
          // Find new assignees to add
          const newAssignees = selectedAssignees.filter((id) => !currentAssigneeIds.includes(id));
          
          // Find assignees to remove
          const assigneesToRemove = currentAssigneeIds.filter((id) => !selectedAssignees.includes(id));

          // Remove assignments
          if (assigneesToRemove.length > 0) {
            const { error: removeError } = await supabase
              .from("task_assignments")
              .delete()
              .eq("task_id", taskToEdit.id)
              .in("assigned_to", assigneesToRemove);

            if (removeError) throw removeError;
          }

          // Add new assignments
          if (newAssignees.length > 0) {
            const newAssignments = await Promise.all(
              newAssignees.map(async (assigneeId) => {
                let delegationType: "self" | "downward" | "peer" | "upward" = "peer";

                if (assigneeId === user.id) {
                  delegationType = "self";
                } else {
                  const { data: isManager } = await supabase.rpc("is_manager_of", {
                    _manager_id: assigneeId,
                    _subordinate_id: user.id,
                  });

                  if (isManager) {
                    if (!safeSystemSettings.allow_upward_delegation) {
                      throw new Error(
                        `Cannot assign task to ${organizationMembers.find((m) => m.id === assigneeId)?.full_name || "your manager"}. Upward delegation is disabled.`
                      );
                    }
                    delegationType = "upward";
                  } else {
                    const { data: isSubordinate } = await supabase.rpc("is_manager_of", {
                      _manager_id: user.id,
                      _subordinate_id: assigneeId,
                    });

                    if (isSubordinate) {
                      delegationType = "downward";
                    } else {
                      delegationType = "peer";
                    }
                  }
                }

                return {
                  task_id: taskToEdit.id,
                  assigned_to: assigneeId,
                  assigned_by: user.id,
                  delegation_type: delegationType,
                };
              })
            );

            const { error: addError } = await supabase
              .from("task_assignments")
              .insert(newAssignments);

            if (addError) throw addError;
          }
        }

        // Update dependencies
        if (selectedDependencies.length > 0) {
          // Get current dependencies
          const { data: currentDependencies } = await supabase
            .from("task_dependencies")
            .select("depends_on_task_id")
            .eq("task_id", taskToEdit.id);

          const currentDependencyIds = currentDependencies?.map((d) => d.depends_on_task_id) || [];
          
          // Find new dependencies to add
          const newDependencies = selectedDependencies.filter((id) => !currentDependencyIds.includes(id));
          
          // Find dependencies to remove
          const dependenciesToRemove = currentDependencyIds.filter((id) => !selectedDependencies.includes(id));

          // Remove dependencies
          if (dependenciesToRemove.length > 0) {
            const { error: removeError } = await supabase
              .from("task_dependencies")
              .delete()
              .eq("task_id", taskToEdit.id)
              .in("depends_on_task_id", dependenciesToRemove);

            if (removeError) throw removeError;
          }

          // Add new dependencies
          if (newDependencies.length > 0) {
            const newDependencyRecords = newDependencies.map((dependsOnTaskId) => ({
              task_id: taskToEdit.id,
              depends_on_task_id: dependsOnTaskId,
            }));

            const { error: depError } = await supabase
              .from("task_dependencies")
              .insert(newDependencyRecords);

            if (depError) throw depError;
          }
        } else {
          // Remove all dependencies if none selected
          const { error: removeAllError } = await supabase
            .from("task_dependencies")
            .delete()
            .eq("task_id", taskToEdit.id);

          if (removeAllError) throw removeAllError;
        }

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

        // Assign the task to selected assignees (or creator if none selected)
        const assigneesToAssign = selectedAssignees.length > 0 ? selectedAssignees : [user.id];
        
        // Determine delegation type for each assignment
        const assignments = await Promise.all(
          assigneesToAssign.map(async (assigneeId) => {
            let delegationType: "self" | "downward" | "peer" | "upward" = "peer";

            if (assigneeId === user.id) {
              delegationType = "self";
            } else {
              const { data: isManager } = await supabase.rpc("is_manager_of", {
                _manager_id: assigneeId,
                _subordinate_id: user.id,
              });

              if (isManager) {
                    if (!safeSystemSettings.allow_upward_delegation) {
                      throw new Error(
                        `Cannot assign task to ${organizationMembers.find((m) => m.id === assigneeId)?.full_name || "your manager"}. Upward delegation is disabled.`
                      );
                    }
                delegationType = "upward";
              } else {
                const { data: isSubordinate } = await supabase.rpc("is_manager_of", {
                  _manager_id: user.id,
                  _subordinate_id: assigneeId,
                });

                if (isSubordinate) {
                  delegationType = "downward";
                } else {
                  delegationType = "peer";
                }
              }
            }

            return {
              task_id: taskData.id,
              assigned_to: assigneeId,
              assigned_by: user.id,
              delegation_type: delegationType,
            };
          })
        );

        const { error: assignError } = await supabase
          .from("task_assignments")
          .insert(assignments);

        if (assignError) throw assignError;

        // Create dependencies if any selected
        if (selectedDependencies.length > 0) {
          const dependencyRecords = selectedDependencies.map((dependsOnTaskId) => ({
            task_id: taskData.id,
            depends_on_task_id: dependsOnTaskId,
          }));

          const { error: depError } = await supabase
            .from("task_dependencies")
            .insert(dependencyRecords);

          if (depError) throw depError;
        }

        const assigneeNames = assigneesToAssign
          .map((id) => organizationMembers.find((m) => m.id === id)?.full_name || "you")
          .join(", ");

        toast({
          title: "Success!",
          description: `Task created and assigned to ${assigneeNames}`,
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

  // Show loading state while fetching user
  if (userLoading && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
                    <FormDescription>Daily target quantity (optional)</FormDescription>
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

            {/* Dependencies Section - Only show if we have user ID and tasks available */}
            {currentUserId && (
              <div className="space-y-3 pt-4 border-t">
                <FormLabel>Task Dependencies</FormLabel>
                <FormDescription>
                  Select tasks that must be completed before this task can be completed. This task will be blocked until all dependencies are completed.
                </FormDescription>

                {/* Selected Dependencies */}
                {selectedDependencies.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
                    {selectedDependencies.map((taskId) => {
                      const task = availableTasks.find((t) => t.id === taskId);
                      if (!task) return null;
                      return (
                        <Badge
                          key={taskId}
                          variant="secondary"
                          className="flex items-center gap-2 px-3 py-1.5"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>{task.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDependencyToggle(taskId)}
                            className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {/* Search Input with Autocomplete for Dependencies */}
                <Popover open={dependencySearchOpen} onOpenChange={setDependencySearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => setDependencySearchOpen(true)}
                      disabled={dependenciesLoading || availableTasks.length === 0}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      {dependenciesLoading
                        ? "Loading tasks..."
                        : availableTasks.length === 0
                        ? "No other tasks available"
                        : dependencySearchQuery.length >= 2
                        ? `Searching for "${dependencySearchQuery}"...`
                        : "Type at least 2 characters to search for tasks"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search tasks by name (min 2 characters)..."
                        value={dependencySearchQuery}
                        onValueChange={setDependencySearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {dependencySearchQuery.length < 2
                            ? "Type at least 2 characters to search"
                            : "No tasks found"}
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredDependencyTasks.map((task) => (
                            <CommandItem
                              key={task.id}
                              value={task.id}
                              onSelect={() => {
                                handleDependencyToggle(task.id);
                                setDependencySearchQuery("");
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedDependencies.includes(task.id)
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {task.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Assignment Section - Only show if we have user ID */}
            {currentUserId && (
              <div className="space-y-3 pt-4 border-t">
                <FormLabel>Assign To</FormLabel>
                <FormDescription>
                  Search and select people to assign this task to. Type at least 3 characters to search. If none selected, task will be assigned to you.
                </FormDescription>
                
                {!safeSystemSettings.allow_upward_delegation && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Upward delegation is disabled. Your manager(s) and their managers are not shown.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Selected Assignees */}
                {selectedAssignees.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
                    {selectedAssignees.map((assigneeId) => {
                      const member = organizationMembers.find((m) => m.id === assigneeId);
                      if (!member) return null;
                      return (
                        <Badge
                          key={assigneeId}
                          variant="secondary"
                          className="flex items-center gap-2 px-3 py-1.5"
                        >
                          <User className="w-3 h-3" />
                          <span>{member.full_name}</span>
                          {delegationTypes.has(assigneeId) && (
                            <DelegationTypeBadge
                              delegationType={delegationTypes.get(assigneeId) || null}
                              showIcon={false}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => handleAssigneeToggle(assigneeId)}
                            className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {/* Search Input with Autocomplete */}
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => setSearchOpen(true)}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      {searchQuery.length >= 3
                        ? `Searching for "${searchQuery}"...`
                        : "Type at least 3 characters to search for people"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search by name or email (min 3 characters)..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                      />
                      <CommandList>
                        {membersLoading || settingsLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : searchQuery.length < 3 ? (
                          <CommandEmpty>
                            Type at least 3 characters to search
                          </CommandEmpty>
                        ) : searchableMembers.length === 0 ? (
                          <CommandEmpty>No people found matching "{searchQuery}"</CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {searchableMembers.map((member) => {
                              const isSelected = selectedAssignees.includes(member.id);
                              return (
                                <CommandItem
                                  key={member.id}
                                  value={`${member.full_name} ${member.email}`}
                                  onSelect={() => {
                                    handleAssigneeToggle(member.id);
                                    setSearchQuery("");
                                    setSearchOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <User className="w-4 h-4 text-muted-foreground" />
                                      <span className="font-medium truncate">
                                        {member.full_name}
                                      </span>
                                      {member.id === currentUserId && (
                                        <Badge variant="secondary" className="text-xs">
                                          You
                                        </Badge>
                                      )}
                                      {delegationTypes.has(member.id) && (
                                        <DelegationTypeBadge
                                          delegationType={delegationTypes.get(member.id) || null}
                                          showIcon={true}
                                        />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {member.email}
                                    </p>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

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
