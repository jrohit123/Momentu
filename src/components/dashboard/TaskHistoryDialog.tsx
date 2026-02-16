import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar, CheckCircle, Clock, XCircle, AlertCircle, FileText } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface TaskHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  taskName: string;
  taskDescription: string | null;
  benchmark: number | null;
  /** When provided (e.g. from MonthlyView), completions before this date are hidden as no longer relevant */
  monthStart?: string;
}

interface CompletionRecord {
  id: string;
  scheduled_date: string;
  completion_date: string;
  status: TaskStatus;
  quantity_completed: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const TaskHistoryDialog = ({
  open,
  onOpenChange,
  assignmentId,
  taskName,
  taskDescription,
  benchmark,
  monthStart,
}: TaskHistoryDialogProps) => {
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && assignmentId) {
      fetchTaskHistory();
    }
  }, [open, assignmentId]);

  // Filter out completions done before month start (no longer relevant when viewing that month)
  const filteredCompletions = monthStart
    ? completions.filter((c) => c.completion_date >= monthStart)
    : completions;

  const fetchTaskHistory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("task_completions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("scheduled_date", { ascending: false })
        .order("completion_date", { ascending: false });

      if (error) throw error;
      setCompletions(data || []);
    } catch (error: any) {
      console.error("Error fetching task history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "partial":
        return <Clock className="w-4 h-4 text-warning" />;
      case "not_done":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "pending":
        return <AlertCircle className="w-4 h-4 text-warning" />;
      case "delayed":
        return <Clock className="w-4 h-4 text-orange-500" />;
      default:
        return <Calendar className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-success/10 text-success border-success/30">Completed</Badge>;
      case "partial":
        return <Badge className="bg-warning/10 text-warning border-warning/30">Partial</Badge>;
      case "not_done":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Not Done</Badge>;
      case "pending":
        return <Badge className="bg-warning/10 text-warning border-warning/30">Pending</Badge>;
      case "delayed":
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/30">Delayed</Badge>;
      case "scheduled":
        return <Badge variant="outline">Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isDelayed = (completion: CompletionRecord) => {
    return completion.scheduled_date < completion.completion_date &&
           (completion.status === "completed" || completion.status === "partial");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Task History: {taskName}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              {taskDescription && (
                <p className="mt-2">{taskDescription}</p>
              )}
              {benchmark && (
                <p className="mt-1">Target: {benchmark}</p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredCompletions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No completion history available</p>
              <p className="text-sm mt-1">
                {monthStart && completions.length > 0
                  ? "No completions in this month"
                  : "This task hasn't been completed yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCompletions.map((completion) => {
                const delayed = isDelayed(completion);
                return (
                  <div
                    key={completion.id}
                    className="border rounded-lg p-4 space-y-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {getStatusIcon(completion.status)}
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(completion.status)}
                            {delayed && (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                                Delayed
                              </Badge>
                            )}
                          </div>
                          
                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-medium">Scheduled:</span>
                              <span>{format(new Date(completion.scheduled_date), "MMM dd, yyyy")}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-medium">Completed:</span>
                              <span>{format(new Date(completion.completion_date), "MMM dd, yyyy")}</span>
                              {delayed && (
                                <span className="text-orange-600 text-xs">
                                  ({Math.ceil((new Date(completion.completion_date).getTime() - new Date(completion.scheduled_date).getTime()) / (1000 * 60 * 60 * 24))} days late)
                                </span>
                              )}
                            </div>
                            
                            {completion.status === "partial" && completion.quantity_completed !== null && benchmark !== null && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span className="font-medium">Quantity:</span>
                                <span>{completion.quantity_completed} / {benchmark}</span>
                                <span className="text-xs">
                                  ({Math.round((completion.quantity_completed / benchmark) * 100)}%)
                                </span>
                              </div>
                            )}
                            
                            {completion.notes && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <div className="font-medium mb-1">Notes:</div>
                                <div className="whitespace-pre-wrap text-muted-foreground">
                                  {completion.notes}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

