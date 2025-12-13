import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTeamCompletionStats } from "@/hooks/useTeamCompletionStats";
import { useSubordinates } from "@/hooks/useSubordinates";
import { Calendar, TrendingUp, Users } from "lucide-react";
import { format } from "date-fns";

interface TeamOverviewProps {
  user: User;
  currentMonth: Date;
  onViewMemberTasks?: (memberId: string) => void;
}

export const TeamOverview = ({ user, currentMonth, onViewMemberTasks }: TeamOverviewProps) => {
  const { subordinates, loading: subordinatesLoading } = useSubordinates(user.id);
  const { teamStats, loading: statsLoading } = useTeamCompletionStats(user.id, currentMonth);

  const loading = subordinatesLoading || statsLoading;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading team stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (subordinates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Overview
          </CardTitle>
          <CardDescription>
            View completion statistics for your team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>You don't have any team members yet</p>
            <p className="text-sm mt-1">Team members will appear here once they're assigned to you</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate team average
  const teamAverage = teamStats.length > 0
    ? Math.round(teamStats.reduce((sum, stat) => sum + stat.completionPercentage, 0) / teamStats.length)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Team Overview
        </CardTitle>
        <CardDescription>
          Completion statistics for {format(currentMonth, "MMMM yyyy")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team Average */}
        <div className="p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Team Average</span>
            <span className="text-2xl font-bold">{teamAverage}%</span>
          </div>
          <Progress value={teamAverage} className="h-2" />
        </div>

        {/* Individual Team Members */}
        <div className="space-y-3">
          {teamStats.map((stat) => {
            const subordinate = subordinates.find((s) => s.id === stat.userId);
            if (!subordinate) return null;

            const initials = subordinate.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={stat.userId}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{subordinate.full_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {stat.completedTasks} of {stat.totalTasks} tasks completed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right min-w-[60px]">
                    <p className="text-lg font-semibold">{stat.completionPercentage}%</p>
                    <Progress value={stat.completionPercentage} className="h-1.5 w-16 mt-1" />
                  </div>
                  {onViewMemberTasks && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewMemberTasks(stat.userId)}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      View Tasks
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {teamStats.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No completion data available for this month
          </div>
        )}
      </CardContent>
    </Card>
  );
};

