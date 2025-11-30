import { useState } from "react";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface MonthlyViewProps {
  user: User;
}

const MonthlyView = ({ user }: MonthlyViewProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  // Sample tasks - will be replaced with real data
  const sampleTasks = [
    { id: 1, name: "Make Customer Calls", frequency: "Daily (Mon-Fri)", benchmark: "10" },
    { id: 2, name: "Update Documentation", frequency: "Daily", benchmark: "3" },
    { id: 3, name: "Team Standup", frequency: "Daily (Mon-Fri)", benchmark: "-" },
    { id: 4, name: "Weekly Report", frequency: "Weekly (Friday)", benchmark: "1" },
    { id: 5, name: "Code Review", frequency: "Daily (Mon-Fri)", benchmark: "5" },
  ];

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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-semibold text-sm">
                    Task Name
                  </th>
                  <th className="px-2 py-3 text-center font-semibold text-sm w-24">Frequency</th>
                  <th className="px-2 py-3 text-center font-semibold text-sm w-20">Target</th>
                  {daysInMonth.map((day) => (
                    <th
                      key={day.toString()}
                      className={cn(
                        "px-2 py-3 text-center text-xs font-medium w-12",
                        isToday(day) && "bg-primary/10",
                        day.getDay() === 0 && "bg-holiday-weekly-off/50",
                        day.getDay() === 6 && "bg-holiday-weekly-off/50"
                      )}
                    >
                      <div>{format(day, "EEE")}</div>
                      <div className="font-bold">{format(day, "d")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleTasks.map((task) => (
                  <tr key={task.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">
                      {task.name}
                    </td>
                    <td className="px-2 py-3 text-center text-sm text-muted-foreground">
                      {task.frequency}
                    </td>
                    <td className="px-2 py-3 text-center text-sm font-medium">
                      {task.benchmark}
                    </td>
                    {daysInMonth.map((day) => (
                      <td
                        key={day.toString()}
                        className={cn(
                          "px-2 py-3 text-center",
                          isToday(day) && "bg-primary/10",
                          day.getDay() === 0 && "bg-holiday-weekly-off/50",
                          day.getDay() === 6 && "bg-holiday-weekly-off/50"
                        )}
                      >
                        <StatusIndicator
                          status={getRandomStatus(day)}
                          isWeeklyOff={day.getDay() === 0 || day.getDay() === 6}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
  status: "completed" | "not-done" | "pending" | "na";
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

  const statusConfig = {
    completed: { bg: "bg-success", icon: "✓", text: "text-white" },
    "not-done": { bg: "bg-destructive", icon: "✗", text: "text-white" },
    pending: { bg: "bg-warning", icon: "!", text: "text-white" },
    na: { bg: "bg-status-na", icon: "NA", text: "text-white text-[10px]" },
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

// Helper function to generate random status for demo
const getRandomStatus = (day: Date): "completed" | "not-done" | "pending" | "na" => {
  if (day > new Date()) return "na";
  const statuses: ("completed" | "not-done" | "pending")[] = ["completed", "not-done", "pending"];
  return statuses[Math.floor(Math.random() * statuses.length)];
};

export default MonthlyView;