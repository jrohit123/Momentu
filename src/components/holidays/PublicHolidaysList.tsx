import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Plus, Trash2, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";

interface PublicHoliday {
  id: string;
  holiday_name: string;
  holiday_date: string;
  description: string | null;
  is_recurring: boolean | null;
}

interface PublicHolidaysListProps {
  holidays: PublicHoliday[];
  loading: boolean;
  isAdmin: boolean;
  onAdd: (name: string, date: string, description?: string, isRecurring?: boolean) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export const PublicHolidaysList = ({
  holidays,
  loading,
  isAdmin,
  onAdd,
  onDelete,
}: PublicHolidaysListProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name || !date) return;

    setSubmitting(true);
    const success = await onAdd(name, date, description || undefined, isRecurring);
    if (success) {
      setDialogOpen(false);
      setName("");
      setDate("");
      setDescription("");
      setIsRecurring(false);
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
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
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
            <Calendar className="w-5 h-5" />
            Public Holidays
          </CardTitle>
          <CardDescription>
            Organization-wide holidays when tasks are not applicable
          </CardDescription>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Holiday
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Public Holiday</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Holiday Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Christmas Day"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Optional description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recurring"
                    checked={isRecurring}
                    onCheckedChange={(checked) => setIsRecurring(!!checked)}
                  />
                  <Label htmlFor="recurring" className="text-sm">
                    Recurring annually
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!name || !date || submitting}>
                  Add Holiday
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {holidays.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No public holidays configured</p>
          </div>
        ) : (
          <div className="space-y-3">
            {holidays.map((holiday) => (
              <div
                key={holiday.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{holiday.holiday_name}</span>
                    {holiday.is_recurring && (
                      <Badge variant="secondary" className="text-xs">
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Annual
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(holiday.holiday_date), "EEEE, MMMM d, yyyy")}
                  </p>
                  {holiday.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {holiday.description}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(holiday.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
