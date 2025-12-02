import { useState } from "react";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useMonthlyTasks } from "@/hooks/useMonthlyTasks";
import { useWorkingDays } from "@/hooks/useWorkingDays";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface MonthlyViewProps {
  user: User;
}

const MonthlyView = ({ user }: MonthlyViewProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { tasks, loading } = useMonthlyTasks(user.id, currentDate);
  const { isWorkingDay } = useWorkingDays(user.id);
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Month Navigation */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading text-2xl">
                {format(currentDate, "MMMM yyyy")}
              </CardTitle>
              <CardDescription>Monthly task completion matrix</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={previousMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button size="sm" className="ml-4">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading tasks...</div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">No tasks assigned yet</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-semibold text-sm">
                      Task Name
                    </th>
                    <th className="px-2 py-3 text-center font-semibold text-sm w-24">Frequency</th>
                    <th className="px-2 py-3 text-center font-semibold text-sm w-20">Target</th>
                    {daysInMonth.map((day) => {
                      const workingDayInfo = isWorkingDay(day);
                      return (
                        <th
                          key={day.toString()}
                          className={cn(
                            "px-2 py-3 text-center text-xs font-medium w-12",
                            isToday(day) && "bg-primary/10",
                            !workingDayInfo.isWorkingDay && "bg-holiday-weekly-off/50"
                          )}
                        >
                          <div>{format(day, "EEE")}</div>
                          <div className="font-bold">{format(day, "d")}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((taskData) => {
                    const task = taskData.assignment.task;
                    return (
                      <tr key={taskData.assignment.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">
                          {task.name}
                        </td>
                        <td className="px-2 py-3 text-center text-sm text-muted-foreground">
                          {getFrequencyLabel(task.recurrence_type)}
                        </td>
                        <td className="px-2 py-3 text-center text-sm font-medium">
                          {task.benchmark || "-"}
                        </td>
                        {daysInMonth.map((day) => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const status = taskData.dailyStatuses.get(dateStr) || "not_applicable";
                          const workingDayInfo = isWorkingDay(day);
                          
                          return (
                            <td
                              key={day.toString()}
                              className={cn(
                                "px-2 py-3 text-center",
                                isToday(day) && "bg-primary/10",
                                !workingDayInfo.isWorkingDay && "bg-holiday-weekly-off/50"
                              )}
                            >
                              <StatusIndicator
                                status={status}
                                isWeeklyOff={!workingDayInfo.isWorkingDay}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-success flex items-center justify-center text-white font-bold">
                ✓
              </div>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-destructive flex items-center justify-center text-white font-bold">
                ✗
              </div>
              <span>Not Done</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-warning flex items-center justify-center text-white font-bold">
                !
              </div>
              <span>Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-status-na flex items-center justify-center text-white text-xs">
                NA
              </div>
              <span>Not Applicable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-holiday-weekly-off border border-border"></div>
              <span>Weekly Off</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface StatusIndicatorProps {
  status: TaskStatus;
  isWeeklyOff: boolean;
}

const StatusIndicator = ({ status, isWeeklyOff }: StatusIndicatorProps) => {
  if (isWeeklyOff) {
    return (
      <div className="w-8 h-8 mx-auto rounded flex items-center justify-center text-xs text-muted-foreground">
        -
      </div>
    );
  }

  const statusConfig: Record<TaskStatus, { bg: string; icon: string; text: string }> = {
    completed: { bg: "bg-success", icon: "✓", text: "text-white" },
    partial: { bg: "bg-warning", icon: "◐", text: "text-white" },
    not_done: { bg: "bg-destructive", icon: "✗", text: "text-white" },
    pending: { bg: "bg-warning", icon: "!", text: "text-white" },
    not_applicable: { bg: "bg-status-na", icon: "NA", text: "text-white text-[10px]" },
    scheduled: { bg: "bg-muted", icon: "○", text: "text-muted-foreground" },
  };

  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "w-8 h-8 mx-auto rounded flex items-center justify-center font-bold transition-all hover:scale-110 cursor-pointer",
        config.bg,
        config.text
      )}
    >
      {config.icon}
    </div>
  );
};

export default MonthlyView;