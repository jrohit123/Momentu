import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sun, Plus, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type DayOfWeek = Database["public"]["Enums"]["day_of_week"];

interface WeeklyOff {
  id: string;
  day_of_week: DayOfWeek;
  description: string | null;
}

interface WeeklyOffsListProps {
  weeklyOffs: WeeklyOff[];
  loading: boolean;
  isAdmin: boolean;
  onAdd: (dayOfWeek: DayOfWeek, description?: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

export const WeeklyOffsList = ({
  weeklyOffs,
  loading,
  isAdmin,
  onAdd,
  onDelete,
}: WeeklyOffsListProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | "">("");
  const [submitting, setSubmitting] = useState(false);

  const existingDays = weeklyOffs.map((w) => w.day_of_week);
  const availableDays = DAYS.filter((d) => !existingDays.includes(d.value));

  const handleSubmit = async () => {
    if (!selectedDay) return;

    setSubmitting(true);
    const success = await onAdd(selectedDay as DayOfWeek);
    if (success) {
      setDialogOpen(false);
      setSelectedDay("");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sun className="w-5 h-5" />
            Weekly Offs
          </CardTitle>
          <CardDescription>
            Regular weekly holidays when tasks are not applicable
          </CardDescription>
        </div>
        {isAdmin && availableDays.length > 0 && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Weekly Off
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Weekly Off</DialogTitle>
                <DialogDescription>Select a day of the week as non-working.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select value={selectedDay} onValueChange={(v) => setSelectedDay(v as DayOfWeek)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a day" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDays.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!selectedDay || submitting}>
                  Add Weekly Off
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {weeklyOffs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Sun className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No weekly offs configured</p>
            <p className="text-xs mt-1">All 7 days are working days</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {DAYS.filter((d) => existingDays.includes(d.value)).map((day) => {
              const weeklyOff = weeklyOffs.find((w) => w.day_of_week === day.value);
              return (
                <div
                  key={day.value}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-warning/10 border-warning/30"
                >
                  <Sun className="w-4 h-4 text-warning" />
                  <span className="font-medium">{day.label}</span>
                  {isAdmin && weeklyOff && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => onDelete(weeklyOff.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
