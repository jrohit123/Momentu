import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface DailyViewProps {
  user: User;
}

const DailyView = ({ user }: DailyViewProps) => {
  const [today] = useState(new Date());
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    completion: 0,
  });

  useEffect(() => {
    // TODO: Fetch today's tasks and stats from database
    // For now, showing placeholder data
    setStats({
      total: 8,
      completed: 5,
      pending: 2,
      completion: 62,
    });
  }, [user]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Date and Greeting */}
      <div className="space-y-2">
        <h2 className="font-heading text-3xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}
        </h2>
        <p className="text-muted-foreground text-lg">
          {format(today, "EEEE, dd MMM yyyy")}
        </p>
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
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Sample Task Items - will be replaced with real data */}
            <TaskItem
              title="Make Customer Calls"
              benchmark="10 calls"
              status="completed"
              time="09:00 AM"
            />
            <TaskItem
              title="Update Project Documentation"
              benchmark="3 documents"
              status="completed"
              time="11:00 AM"
            />
            <TaskItem
              title="Team Standup Meeting"
              status="completed"
              time="02:00 PM"
            />
            <TaskItem
              title="Review Pull Requests"
              benchmark="5 PRs"
              status="pending"
              time="03:30 PM"
            />
            <TaskItem
              title="Send Weekly Report"
              status="pending"
              time="05:00 PM"
            />
          </div>
        </CardContent>
      </Card>

      {/* Pending from Previous Days */}
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
            <PendingTaskItem
              title="Complete Quarterly Review"
              originalDate="2 days ago"
              daysOverdue={2}
            />
            <PendingTaskItem
              title="Submit Expense Report"
              originalDate="Yesterday"
              daysOverdue={1}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface TaskItemProps {
  title: string;
  benchmark?: string;
  status: "completed" | "pending" | "not-done";
  time: string;
}

const TaskItem = ({ title, benchmark, status, time }: TaskItemProps) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/30 transition-all hover:shadow-md bg-card">
      <div className="flex items-center gap-3 flex-1">
        {status === "completed" ? (
          <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
        ) : status === "pending" ? (
          <Clock className="w-5 h-5 text-warning flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="font-medium text-foreground">{title}</div>
          {benchmark && <div className="text-sm text-muted-foreground">{benchmark}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{time}</span>
        {status === "pending" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline">Mark Done</Button>
            <Button size="sm" variant="outline">Not Done</Button>
          </div>
        )}
        {status === "completed" && (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
            Completed
          </Badge>
        )}
      </div>
    </div>
  );
};

interface PendingTaskItemProps {
  title: string;
  originalDate: string;
  daysOverdue: number;
}

const PendingTaskItem = ({ title, originalDate, daysOverdue }: PendingTaskItemProps) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-warning/30 bg-warning/5">
      <div className="flex items-center gap-3 flex-1">
        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground">
            Due: {originalDate} · {daysOverdue} working day{daysOverdue > 1 ? "s" : ""} overdue
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default">Complete Now</Button>
      </div>
    </div>
  );
};

export default DailyView;