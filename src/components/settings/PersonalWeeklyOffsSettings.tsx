import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Calendar, Save, Lock } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type DayOfWeek = Database["public"]["Enums"]["day_of_week"];

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

interface PersonalWeeklyOffsSettingsProps {
  user: User;
}

export const PersonalWeeklyOffsSettings = ({ user }: PersonalWeeklyOffsSettingsProps) => {
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isAdmin, isManager } = useUserRole(user.id);
  const canEdit = isAdmin || isManager;

  useEffect(() => {
    fetchUserWeeklyOffs();
  }, [user.id]);

  const fetchUserWeeklyOffs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_weekly_offs")
        .select("day_of_week")
        .eq("user_id", user.id);

      if (error) throw error;

      setSelectedDays((data || []).map((wo) => wo.day_of_week));
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

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Delete existing weekly offs
      await supabase
        .from("user_weekly_offs")
        .delete()
        .eq("user_id", user.id);

      // Insert new weekly offs
      if (selectedDays.length > 0) {
        const { error } = await supabase
          .from("user_weekly_offs")
          .insert(
            selectedDays.map((day) => ({
              user_id: user.id,
              day_of_week: day,
            }))
          );

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Your weekly offs have been updated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save weekly offs",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          My Weekly Offs
        </CardTitle>
        <CardDescription>
          {canEdit
            ? "Set your personal weekly off days. If not set, organization defaults will be used."
            : "Your weekly offs are managed by your administrator or manager. Contact them to make changes."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : !canEdit ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Read Only</p>
                <p className="text-sm text-muted-foreground">
                  Only administrators and managers can modify weekly offs. Please contact your administrator or manager to request changes.
                </p>
              </div>
            </div>

            {selectedDays.length > 0 ? (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Your current weekly offs:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedDays.map((day) => (
                    <span
                      key={day}
                      className="px-3 py-1 bg-background rounded-md text-sm border"
                    >
                      {DAYS_OF_WEEK.find((d) => d.value === day)?.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  No custom weekly offs set. Organization defaults are being used.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label>Select your weekly off days</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

            {selectedDays.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Selected weekly offs:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedDays.map((day) => (
                    <span
                      key={day}
                      className="px-3 py-1 bg-background rounded-md text-sm border"
                    >
                      {DAYS_OF_WEEK.find((d) => d.value === day)?.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Weekly Offs"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

