import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

interface PersonalHoliday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  approval_status: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    email: string;
  };
}

interface TeamHolidayRequestsProps {
  requests: PersonalHoliday[];
  loading: boolean;
  onApprove: (id: string) => Promise<boolean>;
  onReject: (id: string) => Promise<boolean>;
}

export const TeamHolidayRequests = ({
  requests,
  loading,
  onApprove,
  onReject,
}: TeamHolidayRequestsProps) => {
  const pendingRequests = requests.filter((r) => r.approval_status === "pending");
  const processedRequests = requests.filter((r) => r.approval_status !== "pending");

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
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team Leave Requests
        </CardTitle>
        <CardDescription>
          Approve or reject leave requests from your team members
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">
              Pending Approval ({pendingRequests.length})
            </h4>
            {pendingRequests.map((request) => {
              const days = differenceInDays(
                parseISO(request.end_date),
                parseISO(request.start_date)
              ) + 1;

              return (
                <div
                  key={request.id}
                  className="p-4 rounded-lg border border-warning/30 bg-warning/5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {request.profile?.full_name || "Unknown"}
                        </span>
                        {getStatusBadge(request.approval_status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(request.start_date), "MMM d")}
                        {request.start_date !== request.end_date && (
                          <> - {format(parseISO(request.end_date), "MMM d, yyyy")}</>
                        )}
                        {request.start_date === request.end_date && (
                          <>, {format(parseISO(request.start_date), "yyyy")}</>
                        )}
                        {" "}({days} day{days > 1 ? "s" : ""})
                      </p>
                      {request.reason && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Reason: {request.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => onReject(request.id)}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-success hover:bg-success/90"
                        onClick={() => onApprove(request.id)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Processed Requests */}
        {processedRequests.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground">
              Processed ({processedRequests.length})
            </h4>
            {processedRequests.map((request) => {
              const days = differenceInDays(
                parseISO(request.end_date),
                parseISO(request.start_date)
              ) + 1;

              return (
                <div
                  key={request.id}
                  className="p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {request.profile?.full_name || "Unknown"}
                        </span>
                        {getStatusBadge(request.approval_status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(request.start_date), "MMM d")} - {format(parseISO(request.end_date), "MMM d, yyyy")}
                        {" "}({days} day{days > 1 ? "s" : ""})
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {requests.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No leave requests from your team</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
