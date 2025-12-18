import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useSubordinates } from "@/hooks/useSubordinates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Copy, Check, Users } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type DayOfWeek = Database["public"]["Enums"]["day_of_week"];

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
}

interface UserWeeklyOffsProps {
  user: User;
}

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

export const UserWeeklyOffs = ({ user }: UserWeeklyOffsProps) => {
  const { isAdmin, isManager, loading: roleLoading } = useUserRole(user.id);
  const { subordinates } = useSubordinates(user.id);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userWeeklyOffs, setUserWeeklyOffs] = useState<Record<string, DayOfWeek[]>>({});
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [saving, setSaving] = useState(false);
  const [copyFromUserId, setCopyFromUserId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const canManage = isAdmin || isManager;

  useEffect(() => {
    if (canManage) {
      fetchUsersAndWeeklyOffs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isManager, subordinates.length]);

  const fetchUsersAndWeeklyOffs = async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) return;

      let orgUsers: UserProfile[] = [];
      
      if (isAdmin) {
        // Admins can see all users in organization
        const { data } = await supabase
          .from("users")
          .select("id, full_name, email")
          .eq("organization_id", profile.organization_id)
          .eq("is_active", true)
          .order("full_name", { ascending: true });
        orgUsers = data || [];
      } else if (isManager) {
        // Managers can only see their subordinates
        const subordinateIds = subordinates.map((s) => s.id);
        if (subordinateIds.length > 0) {
          const { data } = await supabase
            .from("users")
            .select("id, full_name, email")
            .in("id", subordinateIds)
            .eq("is_active", true)
            .order("full_name", { ascending: true });
          orgUsers = data || [];
        }
      }

      setUsers(orgUsers);

      // Fetch weekly offs for all users
      const { data: weeklyOffs } = await supabase
        .from("user_weekly_offs")
        .select("user_id, day_of_week")
        .in("user_id", orgUsers.map((u) => u.id));

      const weeklyOffsMap: Record<string, DayOfWeek[]> = {};
      orgUsers.forEach((u) => {
        weeklyOffsMap[u.id] = [];
      });

      weeklyOffs?.forEach((wo) => {
        if (!weeklyOffsMap[wo.user_id]) {
          weeklyOffsMap[wo.user_id] = [];
        }
        weeklyOffsMap[wo.user_id].push(wo.day_of_week);
      });

      setUserWeeklyOffs(weeklyOffsMap);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch weekly offs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedDays(userWeeklyOffs[userId] || []);
    setCopyFromUserId(null);
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUserId) return;

    try {
      setSaving(true);

      // Delete existing weekly offs for this user
      await supabase
        .from("user_weekly_offs")
        .delete()
        .eq("user_id", selectedUserId);

      // Insert new weekly offs
      if (selectedDays.length > 0) {
        const { error } = await supabase
          .from("user_weekly_offs")
          .insert(
            selectedDays.map((day) => ({
              user_id: selectedUserId,
              day_of_week: day,
            }))
          );

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Weekly offs updated successfully",
      });

      setEditDialogOpen(false);
      fetchUsersAndWeeklyOffs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update weekly offs",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFrom = () => {
    if (!copyFromUserId) return;
    const sourceDays = userWeeklyOffs[copyFromUserId] || [];
    setSelectedDays([...sourceDays]);
    toast({
      title: "Copied",
      description: "Weekly offs copied from selected user",
    });
  };

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  };

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>
            Only administrators and managers can manage weekly offs.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  if (isManager && users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            User Weekly Offs
          </CardTitle>
          <CardDescription>
            Manage individual weekly off days for your team members
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            User Weekly Offs
          </CardTitle>
          <CardDescription>
            Manage individual weekly off days for each team member
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Weekly Offs</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const days = userWeeklyOffs[u.id] || [];
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {days.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {days.map((day) => (
                            <span
                              key={day}
                              className="px-2 py-1 bg-muted rounded text-xs"
                            >
                              {DAYS_OF_WEEK.find((d) => d.value === day)?.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Using organization defaults
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(u.id)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Weekly Offs</DialogTitle>
            <DialogDescription>
              Select the days of the week when this user is off
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Copy from another user */}
            <div className="space-y-2">
              <Label>Copy from another user (optional)</Label>
              <div className="flex gap-2">
                <Select
                  value={copyFromUserId || ""}
                  onValueChange={(value) => setCopyFromUserId(value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user to copy from" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((u) => u.id !== selectedUserId)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {copyFromUserId && (
                  <Button variant="outline" size="sm" onClick={handleCopyFrom}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                )}
              </div>
            </div>

            {/* Day selection */}
            <div className="space-y-2">
              <Label>Select Weekly Off Days</Label>
              <div className="grid grid-cols-2 gap-3">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={day.value}
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <Label
                      htmlFor={day.value}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

