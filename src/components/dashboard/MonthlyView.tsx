import { useState, useMemo, useRef, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Search, X, ArrowUp, ArrowDown, ArrowUpDown, CheckCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useMonthlyTasks } from "@/hooks/useMonthlyTasks";
import { useWorkingDays } from "@/hooks/useWorkingDays";
import { useSubordinates } from "@/hooks/useSubordinates";
import { useTeamCompletionStats } from "@/hooks/useTeamCompletionStats";
import { exportMonthlyToExcel, exportMonthlyToCSV } from "@/lib/exportUtils";
import { useToast } from "@/hooks/use-toast";
import { TaskCompletionDialog } from "@/components/tasks/TaskCompletionDialog";
import { TaskHistoryDialog } from "@/components/dashboard/TaskHistoryDialog";
import { TaskApprovalDialog } from "@/components/tasks/TaskApprovalDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { formatDateForDB } from "@/lib/dateUtils";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface MonthlyViewProps {
  user: User;
}

const MonthlyView = ({ user }: MonthlyViewProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { subordinates, loading: subordinatesLoading } = useSubordinates(user.id);
  const [selectedSubordinateId, setSelectedSubordinateId] = useState<string>("self");
  const targetUserId = selectedSubordinateId === "self" ? undefined : selectedSubordinateId;
  const { tasks, loading, refresh } = useMonthlyTasks(user.id, currentDate, targetUserId);
  const effectiveUserId = targetUserId || user.id;
  const { isWorkingDay, getLeaveDatesInRange } = useWorkingDays(effectiveUserId);
  const { teamStats } = useTeamCompletionStats(user.id, currentDate);
  const { toast } = useToast();
  const { isManager } = useUserRole(user.id);
  const { settings } = useSystemSettings(organizationId);

  useEffect(() => {
    const fetchOrganizationId = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;
        setOrganizationId(data?.organization_id || null);
      } catch (error) {
        console.error("Error fetching organization ID:", error);
      }
    };

    fetchOrganizationId();
  }, [user.id]);
  
  // State for task completion dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{
    assignmentId: string;
    taskName: string;
    benchmark: number | null;
    description: string | null;
    date: Date;
  } | null>(null);
  
  // State for task history dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedTaskForHistory, setSelectedTaskForHistory] = useState<{
    assignmentId: string;
    taskName: string;
    taskDescription: string | null;
    benchmark: number | null;
  } | null>(null);
  
  // State for month completion breakdown dialog
  const [breakdownDialogOpen, setBreakdownDialogOpen] = useState(false);
  
  // State for task approval dialog
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const isClosingDialogRef = useRef(false);
  const [selectedCompletionForApproval, setSelectedCompletionForApproval] = useState<{
    completionId: string;
    assignmentId: string;
    taskName: string;
    employeeName: string;
    completionDate: string;
    scheduledDate: string;
    status: TaskStatus;
    quantity: number | null;
    notes: string | null;
    approvalStatus: string;
  } | null>(null);

  // Track recently approved/rejected completion IDs to prevent immediate reopening
  const recentlyProcessedRef = useRef<Set<string>>(new Set());

  // Ensure dialog is closed when selectedCompletionForApproval is cleared
  useEffect(() => {
    if (!selectedCompletionForApproval && approvalDialogOpen) {
      setApprovalDialogOpen(false);
    }
  }, [selectedCompletionForApproval, approvalDialogOpen]);
  
  // Function to mark task complete for a specific date
  const handleTaskStatusUpdate = async (
    assignmentId: string,
    status: TaskStatus,
    scheduledDate: Date,
    quantityCompleted?: number,
    notes?: string
  ) => {
    try {
      const scheduledDateStr = formatDateForDB(scheduledDate, settings.timezone);
      const completionDateStr = formatDateForDB(new Date(), settings.timezone); // Always use today as completion date

      const approvalData = settings.auto_approve_tasks
        ? { approval_status: "approved" as const, approved_by: user.id }
        : { approval_status: "pending" as const, approved_by: null };

      // Check if completion already exists for this scheduled date
      const { data: existing } = await supabase
        .from("task_completions")
        .select("id")
        .eq("assignment_id", assignmentId)
        .eq("scheduled_date", scheduledDateStr)
        .maybeSingle();
      
      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("task_completions")
          .update({
            completion_date: completionDateStr,
            status,
            quantity_completed: quantityCompleted,
            notes,
            ...approvalData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("task_completions")
          .insert({
            assignment_id: assignmentId,
            scheduled_date: scheduledDateStr,
            completion_date: completionDateStr,
            status,
            quantity_completed: quantityCompleted,
            notes,
            ...approvalData,
          });
        
        if (error) throw error;
      }
      
      toast({
        title: "Success",
        description: "Task status updated successfully",
      });
      
      // Refresh the monthly view
      await refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update task status",
        variant: "destructive",
      });
      throw error;
    }
  };
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  
  // Sort states
  type SortColumn = "frequency" | "target" | "taskName" | null;
  type SortDirection = "asc" | "desc";
  const [sortColumn, setSortColumn] = useState<SortColumn>(null); // null means use default sort
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthName = format(currentDate, "MMMM yyyy");

  // Get unique categories from tasks
  const categories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    tasks.forEach((taskData) => {
      const task = taskData.assignment.task;
      if (task) {
        const category = task.category;
        if (category) {
          uniqueCategories.add(category);
        }
      }
    });
    return Array.from(uniqueCategories).sort();
  }, [tasks]);

  // Handle sort column change
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Get frequency order for sorting (lower number = higher priority)
  const getFrequencyOrder = (recurrenceType: string): number => {
    switch (recurrenceType) {
      case "daily":
        return 1;
      case "weekly":
        return 2;
      case "monthly":
        return 3;
      case "yearly":
        return 4;
      case "none":
        return 5;
      default:
        return 6;
    }
  };

  // Filter and sort tasks based on search, category, status, and sort settings
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter((taskData) => {
      const task = taskData.assignment.task;
      
      // Skip if task is null (e.g., deleted task with existing assignment)
      if (!task) {
        return false;
      }

      // Hide tasks with no relevance to current month (e.g. one-time tasks completed before month start)
      const hasRelevanceToMonth = daysInMonth.some((day) => {
        const dateStr = formatDateForDB(day, settings.timezone);
        const status = taskData.dailyStatuses.get(dateStr);
        return status && status !== "not_applicable";
      });
      if (!hasRelevanceToMonth) {
        return false;
      }
      
      // Search filter - match task name
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (!task.name.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      // Category filter
      if (categoryFilter !== "all") {
        if (task.category !== categoryFilter) {
          return false;
        }
      }
      
      // Status filter - check if task has the selected status on any day
      if (statusFilter !== "all") {
        const hasStatus = Array.from(taskData.dailyStatuses.values()).includes(statusFilter as TaskStatus);
        if (!hasStatus) {
          return false;
        }
      }

      // Approval status filter - check if task has the selected approval status on any day
      if (approvalFilter !== "all") {
        const hasApprovalStatus = Array.from(taskData.dailyApprovalStatuses?.values() || []).includes(approvalFilter);
        if (!hasApprovalStatus) {
          return false;
        }
      }

      return true;
    });

    // Apply sorting
    if (sortColumn === null) {
      // Default sort: Frequency -> Target -> Task Name
      filtered = [...filtered].sort((a, b) => {
        const taskA = a.assignment.task;
        const taskB = b.assignment.task;
        
        if (!taskA || !taskB) return 0;
        
        // Sort by frequency
        const freqA = getFrequencyOrder(taskA.recurrence_type);
        const freqB = getFrequencyOrder(taskB.recurrence_type);
        if (freqA !== freqB) {
          return freqA - freqB;
        }
        
        // Sort by target (benchmark) - descending
        const targetA = taskA.benchmark ?? 0;
        const targetB = taskB.benchmark ?? 0;
        if (targetA !== targetB) {
          return targetB - targetA; // Descending order
        }
        
        // Sort by task name
        return taskA.name.localeCompare(taskB.name);
      });
    } else {
      // Custom sort based on selected column
      filtered = [...filtered].sort((a, b) => {
        const taskA = a.assignment.task;
        const taskB = b.assignment.task;
        
        if (!taskA || !taskB) return 0;
        
        let comparison = 0;
        
        switch (sortColumn) {
          case "frequency":
            const freqA = getFrequencyOrder(taskA.recurrence_type);
            const freqB = getFrequencyOrder(taskB.recurrence_type);
            comparison = freqA - freqB;
            break;
          case "target":
            const targetA = taskA.benchmark ?? 0;
            const targetB = taskB.benchmark ?? 0;
            comparison = targetA - targetB;
            break;
          case "taskName":
            comparison = taskA.name.localeCompare(taskB.name);
            break;
        }
        
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }, [tasks, searchQuery, categoryFilter, statusFilter, approvalFilter, sortColumn, sortDirection, daysInMonth, settings.timezone]);

  // Calculate day-wise completion percentages
  const dayWiseCompletion = useMemo(() => {
    const dayStats = new Map<string, { completed: number; scheduled: number; percentage: number }>();
    const leaveDateSet = getLeaveDatesInRange(monthStart, monthEnd);
    
    daysInMonth.forEach((day) => {
      const dateStr = formatDateForDB(day, settings.timezone);
      const isLeaveDay = leaveDateSet.has(dateStr);
      let completed = 0;
      let scheduled = 0;
      
      filteredTasks.forEach((taskData) => {
        const status = taskData.dailyStatuses.get(dateStr);
        const quantity = taskData.dailyQuantities.get(dateStr) || null;
        const task = taskData.assignment.task;
        const benchmark = task?.benchmark || null;
        const approvalStatus = taskData.dailyApprovalStatuses?.get(dateStr);

        // Exclude tasks on leave days from completion % (still show as pending)
        if (isLeaveDay) return;

        // Only count if task is scheduled for this day (not NA) and approved
        if (status && status !== "not_applicable" && approvalStatus === "approved") {
          scheduled++;

          if (status === "completed") {
            completed += 1;
          } else if (status === "partial" && quantity !== null && benchmark !== null && benchmark > 0) {
            // Add completion percentage for partial tasks
            completed += quantity / benchmark;
          }
        }
      });
      
      const percentage = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
      dayStats.set(dateStr, { completed, scheduled, percentage });
    });
    
    return dayStats;
  }, [filteredTasks, daysInMonth, settings.timezone, getLeaveDatesInRange, monthStart, monthEnd]);

  // Calculate month-wise completion percentage and detailed breakdown
  const { monthWiseCompletion, breakdown } = useMemo(() => {
    let totalCompleted = 0;
    let totalScheduled = 0;
    let completedCount = 0;
    let partialCount = 0;
    let partialTotal = 0;
    let delayedCount = 0;
    let notDoneCount = 0;
    let pendingCount = 0;
    let scheduledCount = 0;
    const leaveDateSet = getLeaveDatesInRange(monthStart, monthEnd);
    
    // Calculate across all days in the month
    daysInMonth.forEach((day) => {
      const dateStr = formatDateForDB(day, settings.timezone);
      const isLeaveDay = leaveDateSet.has(dateStr);
      
      filteredTasks.forEach((taskData) => {
        const status = taskData.dailyStatuses.get(dateStr);
        const quantity = taskData.dailyQuantities.get(dateStr) || null;
        const task = taskData.assignment.task;
        const benchmark = task?.benchmark || null;
        const approvalStatus = taskData.dailyApprovalStatuses?.get(dateStr);

        // Exclude tasks on leave days from completion % (still show as pending)
        if (isLeaveDay) return;

        // Only count scheduled tasks (not NA) and approved tasks
        if (status && status !== "not_applicable" && approvalStatus === "approved") {
          totalScheduled++;

          if (status === "completed") {
            totalCompleted += 1;
            completedCount++;
          } else if (status === "partial" && quantity !== null && benchmark !== null && benchmark > 0) {
            // Add completion percentage for partial tasks
            const partialValue = quantity / benchmark;
            totalCompleted += partialValue;
            partialCount++;
            partialTotal += partialValue;
          } else if (status === "delayed") {
            // Delayed tasks count as 0.5
            totalCompleted += 0.5;
            delayedCount++;
          } else if (status === "not_done") {
            notDoneCount++;
          } else if (status === "pending") {
            pendingCount++;
          } else if (status === "scheduled") {
            scheduledCount++;
          }
        }
      });
    });
    
    const percentage = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
    
    return {
      monthWiseCompletion: percentage,
      breakdown: {
        totalScheduled,
        totalCompleted,
        completedCount,
        partialCount,
        partialTotal,
        delayedCount,
        notDoneCount,
        pendingCount,
        scheduledCount,
      },
    };
  }, [filteredTasks, daysInMonth, settings.timezone, getLeaveDatesInRange, monthStart, monthEnd]);

  // Get selected user's completion percentage (uses monthWiseCompletion for self - excludes leave days)
  const selectedUserStats = useMemo(() => {
    if (selectedSubordinateId === "self") {
      return {
        completionPercentage: monthWiseCompletion,
        fullName: "Your",
      };
    } else {
      const subordinate = subordinates.find((s) => s.id === selectedSubordinateId);
      const stats = teamStats.find((s) => s.userId === selectedSubordinateId);
      return {
        completionPercentage: stats?.completionPercentage || 0,
        fullName: subordinate?.full_name || "User",
      };
    }
  }, [selectedSubordinateId, subordinates, teamStats, monthWiseCompletion]);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const getFrequencyLabel = (recurrenceType: string) => {
    switch (recurrenceType) {
      case "daily":
        return "Daily";
      case "weekly":
        return "Weekly";
      case "monthly":
        return "Monthly";
      case "yearly":
        return "Yearly";
      case "none":
        return "One-time";
      default:
        return recurrenceType;
    }
  };

  const handleExportExcel = async () => {
    try {
      const tasksToExport = filteredTasks.length > 0 ? filteredTasks : tasks;
      if (tasksToExport.length === 0) {
        toast({
          title: "No data to export",
          description: "There are no tasks to export for this month.",
          variant: "destructive",
        });
        return;
      }

      await exportMonthlyToExcel(tasksToExport, daysInMonth, monthName, isWorkingDay);
      toast({
        title: "Export successful",
        description: `Monthly tasks exported to Excel for ${monthName}`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "An error occurred while exporting",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = () => {
    try {
      const tasksToExport = filteredTasks.length > 0 ? filteredTasks : tasks;
      if (tasksToExport.length === 0) {
        toast({
          title: "No data to export",
          description: "There are no tasks to export for this month.",
          variant: "destructive",
        });
        return;
      }

      exportMonthlyToCSV(tasksToExport, daysInMonth, monthName, isWorkingDay);
      toast({
        title: "Export successful",
        description: `Monthly tasks exported to CSV for ${monthName}`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "An error occurred while exporting",
        variant: "destructive",
      });
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setApprovalFilter("all");
    setSelectedSubordinateId("self");
    setSortColumn(null);
    setSortDirection("asc");
  };

  const hasActiveFilters = searchQuery.trim() || categoryFilter !== "all" || statusFilter !== "all" || approvalFilter !== "all" || selectedSubordinateId !== "self";

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Month Navigation */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="font-heading text-xl sm:text-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span>{format(currentDate, "MMMM yyyy")}</span>
                  {selectedSubordinateId !== "self" && (
                    <span className="text-base sm:text-lg text-muted-foreground">
                      - {selectedUserStats.fullName} ({selectedUserStats.completionPercentage}%)
                    </span>
                  )}
                  {!loading && tasks.length > 0 && (
                    <button
                      onClick={() => setBreakdownDialogOpen(true)}
                      className="text-base sm:text-lg text-primary font-semibold hover:underline cursor-pointer"
                      title="Click to view calculation breakdown"
                    >
                      <span className="hidden sm:inline">| </span>Month: {monthWiseCompletion}%
                    </button>
                  )}
                </div>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {selectedSubordinateId === "self" 
                  ? "Monthly task completion matrix" 
                  : `Viewing ${selectedUserStats.fullName.toLowerCase()} tasks`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={previousMonth} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="h-8 text-xs sm:text-sm">
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8" disabled={loading || tasks.length === 0}>
                    <Download className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV}>
                    <FileText className="w-4 h-4 mr-2" />
                    Export to CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {/* Filters */}
          {!loading && (
            <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
              {/* Subordinate Filter - Only show if user has subordinates */}
              {subordinates.length > 0 && (
                <Select value={selectedSubordinateId} onValueChange={setSelectedSubordinateId}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="View Tasks For" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Myself</SelectItem>
                    {subordinates.map((subordinate) => {
                      const stats = teamStats.find((s) => s.userId === subordinate.id);
                      const percentage = stats?.completionPercentage || 0;
                      return (
                        <SelectItem key={subordinate.id} value={subordinate.id}>
                          {subordinate.full_name} ({percentage}%)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}

              {/* Search Input */}
              {tasks.length > 0 && (
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {/* Category Filter */}
              {tasks.length > 0 && (
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Status Filter */}
              {tasks.length > 0 && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="not_done">Not Done</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="not_applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Approval Status Filter */}
              {tasks.length > 0 && (
                <Select value={approvalFilter} onValueChange={setApprovalFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Approvals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Approvals</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </Button>
              )}

              {/* Results Count */}
              {hasActiveFilters && tasks.length > 0 && (
                <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                  Showing {filteredTasks.length} of {tasks.length} tasks
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading tasks...</div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">No tasks assigned yet</div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">No tasks match your filters</div>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="sticky left-0 z-10 bg-card px-2 sm:px-4 py-1.5 text-left font-semibold text-xs sm:text-sm w-48 sm:w-72 min-w-[12rem] sm:min-w-[18rem]">
                        <button
                          onClick={() => handleSort("taskName")}
                          className="flex items-center gap-1 hover:text-primary transition-colors group"
                          title="Sort by Task Name"
                        >
                          <span>Task Name</span>
                          {sortColumn === "taskName" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="w-3 h-3 text-primary" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-muted-foreground opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                      </th>
                      <th className="px-1 py-1.5 text-center font-semibold text-xs sm:text-sm w-16 sm:w-24">
                        <button
                          onClick={() => handleSort("frequency")}
                          className="flex items-center justify-center gap-1 hover:text-primary transition-colors mx-auto group"
                          title="Sort by Frequency"
                        >
                          <span>Frequency</span>
                          {sortColumn === "frequency" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="w-3 h-3 text-primary" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-muted-foreground opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                      </th>
                      <th className="px-1 py-1.5 text-center font-semibold text-xs sm:text-sm w-16 sm:w-20">
                        <button
                          onClick={() => handleSort("target")}
                          className="flex items-center justify-center gap-1 hover:text-primary transition-colors mx-auto group"
                          title="Sort by Target"
                        >
                          <span>Target</span>
                          {sortColumn === "target" ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="w-3 h-3 text-primary" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-muted-foreground opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                      </th>
                      {daysInMonth.map((day) => {
                        const workingDayInfo = isWorkingDay(day);
                        const isTodayDate = isToday(day);
                        return (
                          <th
                            key={day.toString()}
                            className={cn(
                              "px-0.5 sm:px-1 py-1.5 text-center text-[10px] sm:text-xs font-medium w-10 sm:w-12",
                              isTodayDate && "bg-primary/20 border-l-2 border-r-2 border-primary",
                              !workingDayInfo.isWorkingDay && !isTodayDate && "bg-holiday-weekly-off/50"
                            )}
                          >
                            <div className="hidden sm:block">{format(day, "EEE")}</div>
                            <div className="font-bold">{format(day, "d")}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                <tbody>
                  {filteredTasks.map((taskData) => {
                    const task = taskData.assignment.task;
                    // Skip rendering if task is null (e.g., deleted task with existing assignment)
                    if (!task) {
                      return null;
                    }
                    return (
                      <tr key={taskData.assignment.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium">
                          <button
                            onClick={() => {
                              setSelectedTaskForHistory({
                                assignmentId: taskData.assignment.id,
                                taskName: task.name,
                                taskDescription: task.description,
                                benchmark: task.benchmark,
                              });
                              setHistoryDialogOpen(true);
                            }}
                            className="hover:underline text-left flex items-center gap-1 sm:gap-2 group text-xs sm:text-sm"
                            title="Click to view daily task history"
                          >
                            <span className="break-words whitespace-normal min-w-0">{task.name}</span>
                            <FileText className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </button>
                        </td>
                        <td className="px-1 py-1.5 text-center text-xs sm:text-sm text-muted-foreground">
                          <span className="hidden sm:inline">{getFrequencyLabel(task.recurrence_type)}</span>
                          <span className="sm:hidden">{getFrequencyLabel(task.recurrence_type).charAt(0)}</span>
                        </td>
                        <td className="px-1 py-1.5 text-center text-xs sm:text-sm text-muted-foreground">
                          {task.benchmark || "-"}
                        </td>
                        {daysInMonth.map((day) => {
                          const dateStr = formatDateForDB(day, settings.timezone);
                          const status = taskData.dailyStatuses.get(dateStr) || "not_applicable";
                          const notes = taskData.dailyNotes.get(dateStr) || null;
                          const quantity = taskData.dailyQuantities.get(dateStr) || null;
                          const benchmark = task.benchmark || null;
                          const completionDate = taskData.dailyCompletionDates.get(dateStr) || null;
                          const approvalStatus = taskData.dailyApprovalStatuses?.get(dateStr);
                          const managerComment = taskData.dailyManagerComments?.get(dateStr);
                          const workingDayInfo = isWorkingDay(day);
                          const isTodayDate = isToday(day);
                          
                          // Check if manager is viewing a subordinate's tasks
                          const isViewingSubordinate = isManager && targetUserId && targetUserId !== user.id;
                          
                          // Check if task has been approved or rejected - employees cannot edit once manager has actioned
                          const isActioned = approvalStatus === "approved" || approvalStatus === "rejected";
                          
                          // Only allow editing for today's date (and not for managers viewing subordinate tasks)
                          // Also prevent editing if task has been approved or rejected by manager
                          const canEdit = !isViewingSubordinate && !isActioned && isTodayDate && (status === "scheduled" || status === "pending" || status === "not_applicable" || status === "completed" || status === "partial" || status === "not_done" || status === "delayed");
                          
                          // Allow managers to approve/reject pending tasks (when viewing subordinate's tasks)
                          const canApprove = isViewingSubordinate && approvalStatus === "pending" && (status === "completed" || status === "partial" || status === "not_done");
                          
                          return (
                            <td
                              key={day.toString()}
                              className={cn(
                                "px-1 py-1.5 text-center",
                                isTodayDate && "bg-primary/20 border-l-2 border-r-2 border-primary",
                                !workingDayInfo.isWorkingDay && !isTodayDate && "bg-holiday-weekly-off/50"
                              )}
                            >
                              <div className="flex items-center justify-center gap-1.5">
                                <StatusIndicator
                                  status={status}
                                  isWeeklyOff={!workingDayInfo.isWorkingDay}
                                  notes={notes}
                                  quantity={quantity}
                                  benchmark={benchmark}
                                  completionDate={completionDate}
                                  approvalStatus={approvalStatus}
                                  managerComment={managerComment}
                                  onClick={canEdit ? () => {
                                    setSelectedTask({
                                      assignmentId: taskData.assignment.id,
                                      taskName: task.name,
                                      benchmark: task.benchmark,
                                      description: task.description,
                                      date: day,
                                    });
                                    setDialogOpen(true);
                                  } : undefined}
                                  canEdit={canEdit}
                                />
                                {canApprove && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    type="button"
                                    className="h-7 w-7 p-0 hover:bg-primary/20 flex-shrink-0 border-primary/30"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      // Fetch completion details for approval
                                      try {
                                        const { data: completion, error } = await supabase
                                          .from("task_completions")
                                          .select(`
                                            id,
                                            status,
                                            quantity_completed,
                                            notes,
                                            completion_date,
                                            approval_status,
                                            assignment:task_assignments!inner(
                                              assigned_to,
                                              assigned_to_user:users!task_assignments_assigned_to_fkey(full_name)
                                            )
                                          `)
                                          .eq("assignment_id", taskData.assignment.id)
                                          .eq("scheduled_date", dateStr)
                                          .maybeSingle();
                                        
                                        if (error) throw error;
                                        if (!completion) {
                                          return;
                                        }
                                        
                                        const assignedToUser = (completion.assignment as any)?.assigned_to_user;
                                        // Prevent opening if we're in the process of closing or if this completion was recently processed
                                        if (isClosingDialogRef.current || recentlyProcessedRef.current.has(completion.id)) {
                                          return;
                                        }
                                        setSelectedCompletionForApproval({
                                          completionId: completion.id,
                                          assignmentId: taskData.assignment.id,
                                          taskName: task.name,
                                          employeeName: assignedToUser?.full_name || "Employee",
                                          completionDate: completion.completion_date,
                                          scheduledDate: format(new Date(dateStr), "MMM dd, yyyy"),
                                          status: completion.status as TaskStatus,
                                          quantity: completion.quantity_completed,
                                          notes: completion.notes,
                                          approvalStatus: completion.approval_status,
                                        });
                                        setApprovalDialogOpen(true);
                                      } catch (error: any) {
                                        console.error('Error in approval button click', error);
                                        toast({
                                          title: "Error",
                                          description: error.message || "Failed to load completion details",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    title="Review & Approve"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* Day-wise Completion % Row */}
                  <tr className="border-t-2 border-border bg-green-100 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/50 px-2 py-1.5 text-xs sm:text-sm font-semibold">
                      <span className="hidden sm:inline">Day-wise Completion %</span>
                      <span className="sm:hidden">Day %</span>
                    </td>
                    <td className="px-1 py-1.5 text-center text-xs sm:text-sm">-</td>
                    <td className="px-1 py-1.5 text-center text-xs sm:text-sm">-</td>
                    {daysInMonth.map((day) => {
                      const dateStr = formatDateForDB(day, settings.timezone);
                      const dayStat = dayWiseCompletion.get(dateStr);
                      const percentage = dayStat?.percentage || 0;
                      const workingDayInfo = isWorkingDay(day);
                      const isTodayDate = isToday(day);
                      
                      return (
                        <td
                          key={day.toString()}
                          className={cn(
                            "px-0.5 sm:px-1 py-1.5 text-center text-xs sm:text-sm font-semibold",
                            isTodayDate && "bg-primary/20 border-l-2 border-r-2 border-primary",
                            !workingDayInfo.isWorkingDay && !isTodayDate && "bg-holiday-weekly-off/50"
                          )}
                        >
                          {dayStat && dayStat.scheduled > 0 ? `${percentage}%` : "-"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-success flex items-center justify-center text-white font-bold text-[10px] sm:text-sm">
                ✓
              </div>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-success flex items-center justify-center text-white font-bold text-[10px] sm:text-sm">
                ✓✓
              </div>
              <span>Final Approved</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-destructive flex items-center justify-center text-white font-bold text-[10px] sm:text-sm">
                <u>✗!</u>
              </div>
              <span>Manager Rejected</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-warning flex items-center justify-center text-white font-bold text-[10px] sm:text-sm">
                ◐ 
              </div>
              <span>Partial</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-destructive flex items-center justify-center text-white font-bold text-[10px] sm:text-sm">
                ✗
              </div>
              <span>Not Done</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-status-na flex items-center justify-center text-white text-[8px] sm:text-xs">
                NA
              </div>
              <span className="hidden sm:inline">Not Applicable</span>
              <span className="sm:hidden">N/A</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-orange-500 flex items-center justify-center text-white font-bold text-[10px] sm:text-sm">
                ⏱
              </div>
              <span>Delayed</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-holiday-weekly-off border border-border"></div>
              <span className="hidden sm:inline">Weekly Off/Holiday (WO/H)</span>
              <span className="sm:hidden">WO/H</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Completion Dialog */}
      {selectedTask && (
        <TaskCompletionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          taskName={selectedTask.taskName}
          benchmark={selectedTask.benchmark}
          description={selectedTask.description}
          autoApproveTasks={settings.auto_approve_tasks}
          onSubmit={async (status, quantity, notes) => {
            try {
              await handleTaskStatusUpdate(
                selectedTask.assignmentId,
                status,
                selectedTask.date,
                quantity,
                notes
              );
              
              setDialogOpen(false);
              setSelectedTask(null);
            } catch (error) {
              // Error is already handled in handleTaskStatusUpdate
            }
          }}
        />
      )}

      {/* Task History Dialog */}
      {selectedTaskForHistory && (
        <TaskHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          assignmentId={selectedTaskForHistory.assignmentId}
          taskName={selectedTaskForHistory.taskName}
          taskDescription={selectedTaskForHistory.taskDescription}
          benchmark={selectedTaskForHistory.benchmark}
          monthStart={formatDateForDB(monthStart, settings.timezone)}
        />
      )}

      {/* Task Approval Dialog */}
      {selectedCompletionForApproval && (
        <TaskApprovalDialog
          key={selectedCompletionForApproval.completionId}
          open={approvalDialogOpen && !isClosingDialogRef.current}
          onOpenChange={(newOpen) => {
            // Prevent dialog from reopening if we're closing it or selectedCompletionForApproval is null
            if ((isClosingDialogRef.current || !selectedCompletionForApproval) && newOpen) {
              return;
            }
            setApprovalDialogOpen(newOpen);
          }}
          taskName={selectedCompletionForApproval.taskName}
          employeeName={selectedCompletionForApproval.employeeName}
          completionDate={format(new Date(selectedCompletionForApproval.completionDate), "MMM dd, yyyy")}
          scheduledDate={selectedCompletionForApproval.scheduledDate}
          status={selectedCompletionForApproval.status}
          quantity={selectedCompletionForApproval.quantity}
          employeeNotes={selectedCompletionForApproval.notes}
          currentApprovalStatus={selectedCompletionForApproval.approvalStatus}
          onApprove={async (comment) => {
            // Mark this completion as recently processed IMMEDIATELY to prevent reopening
            const completionId = selectedCompletionForApproval.completionId;
            recentlyProcessedRef.current.add(completionId);
            try {
              const { error } = await supabase
                .from("task_completions")
                .update({
                  approval_status: "approved",
                  approved_by: user.id,
                  manager_comment: comment || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", selectedCompletionForApproval.completionId);

              if (error) throw error;

              toast({
                title: "Success",
                description: "Task approved successfully",
              });
              // Mark that we're closing the dialog to prevent reopening
              isClosingDialogRef.current = true;
              setApprovalDialogOpen(false);
              // Wait for state update to propagate
              await new Promise(resolve => setTimeout(resolve, 50));
              // Clear selectedCompletionForApproval to unmount the dialog
              setSelectedCompletionForApproval(null);
              // Wait for unmount to complete
              await new Promise(resolve => setTimeout(resolve, 50));
              // Small delay to ensure database update is committed before refresh
              await new Promise(resolve => setTimeout(resolve, 100));
              await refresh();
              // Reset the closing flag and remove from recently processed after a delay
              setTimeout(() => {
                isClosingDialogRef.current = false;
                recentlyProcessedRef.current.delete(completionId);
              }, 3000);
            } catch (error: any) {
              toast({
                title: "Error",
                description: error.message || "Failed to approve task",
                variant: "destructive",
              });
              throw error;
            }
          }}
          onReject={async (comment) => {
            // Mark this completion as recently processed IMMEDIATELY to prevent reopening
            const completionId = selectedCompletionForApproval.completionId;
            recentlyProcessedRef.current.add(completionId);
            try {
              const { error } = await supabase
                .from("task_completions")
                .update({
                  approval_status: "rejected",
                  approved_by: user.id,
                  manager_comment: comment,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", selectedCompletionForApproval.completionId);

              if (error) throw error;

              toast({
                title: "Success",
                description: "Task rejected successfully",
              });
              // Mark that we're closing the dialog to prevent reopening
              isClosingDialogRef.current = true;
              setApprovalDialogOpen(false);
              // Wait for state update to propagate
              await new Promise(resolve => setTimeout(resolve, 50));
              // Clear selectedCompletionForApproval to unmount the dialog
              setSelectedCompletionForApproval(null);
              // Wait for unmount to complete
              await new Promise(resolve => setTimeout(resolve, 50));
              // Small delay to ensure database update is committed before refresh
              await new Promise(resolve => setTimeout(resolve, 100));
              await refresh();
              // Reset the closing flag and remove from recently processed after a delay
              setTimeout(() => {
                isClosingDialogRef.current = false;
                recentlyProcessedRef.current.delete(completionId);
              }, 3000);
            } catch (error: any) {
              toast({
                title: "Error",
                description: error.message || "Failed to reject task",
                variant: "destructive",
              });
              throw error;
            }
          }}
        />
      )}

      {/* Month Completion Breakdown Dialog */}
      <Dialog open={breakdownDialogOpen} onOpenChange={setBreakdownDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Month Completion Calculation Breakdown</DialogTitle>
            <DialogDescription>
              Detailed breakdown of how the {monthName} completion percentage is calculated
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Summary */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-lg">Total Completion:</span>
                <span className="font-bold text-2xl text-primary">{monthWiseCompletion}%</span>
              </div>
            </div>

            {/* Breakdown Details */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Total Scheduled Tasks</div>
                  <div className="text-2xl font-bold">{breakdown.totalScheduled}</div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Total Completed Value</div>
                  <div className="text-2xl font-bold">{breakdown.totalCompleted.toFixed(2)}</div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="font-semibold mb-2">Status Breakdown:</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-success/10 rounded">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded bg-success flex items-center justify-center text-white text-xs">✓</span>
                      <span>Completed</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{breakdown.completedCount}</div>
                      <div className="text-xs text-muted-foreground">Contribution: {breakdown.completedCount.toFixed(2)}</div>
                    </div>
                  </div>

                  {breakdown.partialCount > 0 && (
                    <div className="flex items-center justify-between p-2 bg-warning/10 rounded">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded bg-warning flex items-center justify-center text-white text-xs">◐</span>
                        <span>Partial</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{breakdown.partialCount}</div>
                        <div className="text-xs text-muted-foreground">Contribution: {breakdown.partialTotal.toFixed(2)}</div>
                      </div>
                    </div>
                  )}

                  {breakdown.delayedCount > 0 && (
                    <div className="flex items-center justify-between p-2 bg-orange-500/10 rounded">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center text-white text-xs">⏱</span>
                        <span>Delayed</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{breakdown.delayedCount}</div>
                        <div className="text-xs text-muted-foreground">Contribution: {(breakdown.delayedCount * 0.5).toFixed(2)} (0.5 each)</div>
                      </div>
                    </div>
                  )}

                  {breakdown.notDoneCount > 0 && (
                    <div className="flex items-center justify-between p-2 bg-destructive/10 rounded">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded bg-destructive flex items-center justify-center text-white text-xs">✗</span>
                        <span>Not Done</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{breakdown.notDoneCount}</div>
                        <div className="text-xs text-muted-foreground">Contribution: 0</div>
                      </div>
                    </div>
                  )}

                  {breakdown.pendingCount > 0 && (
                    <div className="flex items-center justify-between p-2 bg-warning/10 rounded">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded bg-warning flex items-center justify-center text-white text-xs">!</span>
                        <span>Pending</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{breakdown.pendingCount}</div>
                        <div className="text-xs text-muted-foreground">Contribution: 0</div>
                      </div>
                    </div>
                  )}

                  {breakdown.scheduledCount > 0 && (
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">○</span>
                        <span>Scheduled</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{breakdown.scheduledCount}</div>
                        <div className="text-xs text-muted-foreground">Contribution: 0</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Formula */}
              <div className="border-t pt-3 mt-4">
                <h4 className="font-semibold mb-2">Calculation Formula:</h4>
                <div className="bg-muted/30 p-3 rounded-lg font-mono text-sm">
                  <div className="mb-1">Completion % = (Total Completed Value / Total Scheduled Tasks) × 100</div>
                  <div className="text-muted-foreground">
                    = ({breakdown.totalCompleted.toFixed(2)} / {breakdown.totalScheduled}) × 100
                  </div>
                  <div className="text-primary font-semibold mt-1">
                    = {monthWiseCompletion}%
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  <div>• Completed tasks count as 1.0</div>
                  <div>• Partial tasks count as (quantity / benchmark)</div>
                  <div>• Delayed tasks count as 0.5</div>
                  <div>• Not Done, Pending, and Scheduled tasks count as 0</div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface StatusIndicatorProps {
  status: TaskStatus;
  isWeeklyOff: boolean;
  notes: string | null;
  quantity: number | null;
  completionDate: string | null;
  benchmark: number | null;
  approvalStatus?: string;
  managerComment?: string | null;
  onClick?: () => void;
  canEdit?: boolean;
}

const StatusIndicator = ({ status, isWeeklyOff, notes, quantity, benchmark, completionDate, approvalStatus, managerComment, onClick, canEdit }: StatusIndicatorProps) => {
  // If it's a weekly off but there's a completion status (task was done on weekly off),
  // show the status instead of "-"
  // Only show "-" if it's a weekly off AND there's no completion (status is "not_applicable" or "scheduled")
  if (isWeeklyOff && (status === "not_applicable" || status === "scheduled")) {
    return (
      <div className="w-6 h-6 sm:w-8 sm:h-8 mx-auto rounded flex items-center justify-center text-[10px] sm:text-xs text-muted-foreground">
        -
      </div>
    );
  }

  // Check for approval status and show appropriate indicators
  if (approvalStatus === "approved" && status === "completed") {
    // Completed and approved: show ✓✓ with green background
    const statusIndicator = (
      <div
        onClick={canEdit && onClick ? onClick : undefined}
        className={cn(
          "w-6 h-6 sm:w-8 sm:h-8 mx-auto rounded flex items-center justify-center font-bold transition-all text-[10px] sm:text-sm bg-success text-white",
          canEdit && onClick && "hover:scale-110 cursor-pointer active:scale-95",
          !canEdit || !onClick ? "cursor-default" : ""
        )}
        title={canEdit && onClick ? "Click to update status" : "Final Approved"}
      >
        ✓✓
      </div>
    );

    // Show tooltip with notes and/or manager comments if available
    if ((notes && notes.trim()) || (managerComment && managerComment.trim())) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {statusIndicator}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2">              
                {completionDate && (
                  <p className="font-semibold text-sm">{format(new Date(completionDate), "MMM dd, yyyy")}</p>
                )}
                {notes && notes.trim() && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Employee Notes:</p>
                    <p className="text-sm whitespace-pre-wrap">{notes}</p>
                  </div>
                )}
                {managerComment && managerComment.trim() && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Manager Comment:</p>
                    <p className="text-sm whitespace-pre-wrap">{managerComment}</p>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return statusIndicator;
  }

  if (approvalStatus === "rejected") {
    // Rejected: show ✗! with destructive background
    const statusIndicator = (
      <div
        onClick={canEdit && onClick ? onClick : undefined}
        className={cn(
          "w-6 h-6 sm:w-8 sm:h-8 mx-auto rounded flex items-center justify-center font-bold transition-all text-[10px] sm:text-sm bg-destructive text-white",
          canEdit && onClick && "hover:scale-110 cursor-pointer active:scale-95",
          !canEdit || !onClick ? "cursor-default" : ""
        )}
        title={canEdit && onClick ? "Click to update status" : "Manager Rejected"}
      >
        <u>✗!</u>
      </div>
    );

    // Always show tooltip for rejected tasks (manager comment is required)
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {statusIndicator}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2">              
              {completionDate && (
                <p className="font-semibold text-sm">{format(new Date(completionDate), "MMM dd, yyyy")}</p>
              )}
              <div>
                <p className="text-xs font-semibold text-destructive">Manager Rejected</p>
              </div>
              {managerComment && managerComment.trim() && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Comments:</p>
                  <p className="text-sm whitespace-pre-wrap">{managerComment}</p>
                </div>
              )}
              {notes && notes.trim() && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Employee Notes:</p>
                  {status === "partial" && quantity !== null && benchmark !== null ? (
                    <p className="text-sm whitespace-pre-wrap">Completed: {quantity} (of {benchmark}). {notes}</p>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{notes}</p>
                  )}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const statusConfig: Record<TaskStatus, { bg: string; icon: string; text: string }> = {
    completed: { bg: "bg-success", icon: "✓", text: "text-white" },
    partial: { bg: "bg-warning", icon: "◐", text: "text-white" },
    not_done: { bg: "bg-destructive", icon: "✗", text: "text-white" },
    pending: { bg: "bg-warning", icon: "!", text: "text-white" },
    not_applicable: { bg: "bg-status-na", icon: "NA", text: "text-white text-[10px]" },
    scheduled: { bg: "bg-muted", icon: "○", text: "text-muted-foreground" },
    delayed: { bg: "bg-orange-500", icon: "⏱", text: "text-white" },
  };

  const config = statusConfig[status];

  const statusIndicator = (
    <div
      onClick={canEdit && onClick ? onClick : undefined}
      className={cn(
        "w-6 h-6 sm:w-8 sm:h-8 mx-auto rounded flex items-center justify-center font-bold transition-all text-[10px] sm:text-sm",
        config.bg,
        config.text,
        canEdit && onClick && "hover:scale-110 cursor-pointer active:scale-95",
        !canEdit || !onClick ? "cursor-default" : ""
      )}
      title={canEdit && onClick ? "Click to update status" : undefined}
    >
      {config.icon}
    </div>
  );

  // Show tooltip with notes if available
  if (notes && notes.trim()) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {statusIndicator}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">              
              {completionDate && (
                <p className="font-semibold text-sm">{format(new Date(completionDate), "MMM dd, yyyy")}</p>
              )}
              {status === "partial" && quantity !== null && benchmark !== null ? (
                <p className="text-sm whitespace-pre-wrap">Completed: {quantity} (of {benchmark}). {notes}</p>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{notes}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return statusIndicator;
};

export default MonthlyView;