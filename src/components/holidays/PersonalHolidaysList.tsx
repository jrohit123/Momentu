import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Briefcase, Plus, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

interface PersonalHoliday {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  approval_status: string | null;
  created_at: string;
}

interface PersonalHolidaysListProps {
  holidays: PersonalHoliday[];
  loading: boolean;
  onRequest: (startDate: string, endDate: string, reason?: string) => Promise<boolean>;
}

export const PersonalHolidaysList = ({
  holidays,
  loading,
  onRequest,
}: PersonalHolidaysListProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;

    setSubmitting(true);
    const success = await onRequest(startDate, endDate, reason || undefined);
    if (success) {
      setDialogOpen(false);
      setStartDate("");
      setEndDate("");
      setReason("");
    }
    setSubmitting(false);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-success/10 text-success border-success/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/30">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className="bg-warning/10 text-warning border-warning/30">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
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
            <Briefcase className="w-5 h-5" />
            My Leave Requests
          </CardTitle>
          <CardDescription>
            Request personal time off and track approval status
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Request Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Leave</DialogTitle>
              <DialogDescription>Submit a leave request for the selected dates.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start Date *</Label>
                  <Input
                    id="start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End Date *</Label>
                  <Input
                    id="end"
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              {startDate && endDate && (
                <p className="text-sm text-muted-foreground">
                  Duration: {differenceInDays(parseISO(endDate), parseISO(startDate)) + 1} day(s)
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  placeholder="Optional reason for leave"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!startDate || !endDate || submitting}
              >
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {holidays.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No leave requests</p>
            <p className="text-xs mt-1">Click "Request Leave" to submit a new request</p>
          </div>
        ) : (
          <div className="space-y-3">
            {holidays.map((holiday) => {
              const days = differenceInDays(
                parseISO(holiday.end_date),
                parseISO(holiday.start_date)
              ) + 1;

              return (
                <div
                  key={holiday.id}
                  className="flex items-start justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {format(parseISO(holiday.start_date), "MMM d")}
                        {holiday.start_date !== holiday.end_date && (
                          <> - {format(parseISO(holiday.end_date), "MMM d, yyyy")}</>
                        )}
                        {holiday.start_date === holiday.end_date && (
                          <>, {format(parseISO(holiday.start_date), "yyyy")}</>
                        )}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {days} day{days > 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {holiday.reason && (
                      <p className="text-sm text-muted-foreground">
                        {holiday.reason}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(holiday.approval_status)}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
