import { useState } from "react";
import { User } from "@supabase/supabase-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHolidays } from "@/hooks/useHolidays";
import { useUserRole } from "@/hooks/useUserRole";
import { PublicHolidaysList } from "./PublicHolidaysList";
import { WeeklyOffsList } from "./WeeklyOffsList";
import { PersonalHolidaysList } from "./PersonalHolidaysList";
import { TeamHolidayRequests } from "./TeamHolidayRequests";
import { PersonalWeeklyOffsSettings } from "@/components/settings/PersonalWeeklyOffsSettings";
import { Calendar, Sun, Briefcase, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface HolidayManagementProps {
  user: User;
}

export const HolidayManagement = ({ user }: HolidayManagementProps) => {
  const { isAdmin, isManager } = useUserRole(user.id);
  const holidays = useHolidays(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold">Holiday Management</h2>
        <p className="text-sm text-muted-foreground">
          Manage public holidays, weekly offs, and personal leave
        </p>
      </div>

      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className={cn(
          "grid w-full lg:w-auto lg:inline-grid",
          isAdmin ? "grid-cols-5" : "grid-cols-4"
        )}>
          <TabsTrigger value="personal" className="gap-2">
            <Briefcase className="w-4 h-4" />
            <span className="hidden sm:inline">My Leave</span>
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="team" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="public" className="gap-2">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Public</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="weekly" className="gap-2">
              <Sun className="w-4 h-4" />
              <span className="hidden sm:inline">Org Weekly Offs</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="my-weekly-offs" className="gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">My Weekly Offs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <PersonalHolidaysList
            holidays={holidays.personalHolidays}
            loading={holidays.loading}
            onRequest={holidays.requestPersonalHoliday}
          />
        </TabsContent>

        {isManager && (
          <TabsContent value="team">
            <TeamHolidayRequests
              requests={holidays.teamHolidays}
              loading={holidays.loading}
              onApprove={(id) => holidays.approvePersonalHoliday(id, true)}
              onReject={(id) => holidays.approvePersonalHoliday(id, false)}
            />
          </TabsContent>
        )}

        <TabsContent value="public">
          <PublicHolidaysList
            holidays={holidays.publicHolidays}
            loading={holidays.loading}
            isAdmin={isAdmin}
            onAdd={holidays.addPublicHoliday}
            onDelete={holidays.deletePublicHoliday}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="weekly">
            <WeeklyOffsList
              weeklyOffs={holidays.weeklyOffs}
              loading={holidays.loading}
              isAdmin={isAdmin}
              onAdd={holidays.addWeeklyOff}
              onDelete={holidays.deleteWeeklyOff}
            />
          </TabsContent>
        )}

        <TabsContent value="my-weekly-offs">
          <PersonalWeeklyOffsSettings user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
