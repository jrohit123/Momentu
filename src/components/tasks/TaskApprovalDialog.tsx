import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface TaskApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskName: string;
  employeeName: string;
  completionDate: string;
  scheduledDate: string;
  status: string;
  quantity?: number | null;
  employeeNotes?: string | null;
  currentApprovalStatus?: string;
  onApprove: (comment?: string) => Promise<void>;
  onReject: (comment: string) => Promise<void>;
}

export const TaskApprovalDialog = ({
  open,
  onOpenChange,
  taskName,
  employeeName,
  completionDate,
  scheduledDate,
  status,
  quantity,
  employeeNotes,
  currentApprovalStatus,
  onApprove,
  onReject,
}: TaskApprovalDialogProps) => {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setComment("");
      setError("");
    }
  }, [open]);

  const handleApprove = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      await onApprove(comment.trim() || undefined);
      // Dialog closing is handled by parent component after onApprove completes
    } catch (error: any) {
      setError(error.message || "Failed to approve task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setError("");
    
    // Validate that comment is provided for rejection
    if (!comment.trim()) {
      setError("Comments are required when rejecting a task");
      return;
    }

    setIsSubmitting(true);
    try {
      await onReject(comment.trim());
      // Dialog closing is handled by parent component after onReject completes
    } catch (error: any) {
      setError(error.message || "Failed to reject task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
            Completed
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
            Partial {quantity !== null && quantity !== undefined ? `(${quantity})` : ""}
          </Badge>
        );
      case "not_done":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
            Not Done
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Approve or Reject Task Completion</DialogTitle>
          <DialogDescription>
            Review the task details and provide your approval decision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Information (Read-only) */}
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Task Name</Label>
              <p className="font-medium">{taskName}</p>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">Employee: {employeeName}</Label>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Scheduled Date: {scheduledDate}</Label>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Status: {getStatusBadge()}{completionDate ? ` on ${completionDate}` : ""}</Label>
            </div>

            {quantity !== null && quantity !== undefined && (
              <div>
                <Label className="text-xs text-muted-foreground">Quantity Completed: {quantity}</Label>
              </div>
            )}

            {employeeNotes && (
              <div>
                <Label className="text-xs text-muted-foreground">Employee Notes</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap bg-background p-2 rounded border">
                  {employeeNotes}
                </p>
              </div>
            )}

            {currentApprovalStatus && (
              <div>
                <Label className="text-xs text-muted-foreground">Current Approval Status</Label>
                <Badge
                  variant="outline"
                  className={
                    currentApprovalStatus === "approved"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : currentApprovalStatus === "rejected"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-yellow-50 text-yellow-700 border-yellow-200"
                  }
                >
                  {currentApprovalStatus === "approved"
                    ? "Approved"
                    : currentApprovalStatus === "rejected"
                    ? "Rejected"
                    : "Pending"}
                </Badge>
              </div>
            )}
          </div>

          {/* Manager Comment */}
          <div className="space-y-2">
            <Label htmlFor="manager-comment">
              Your Comments <span className="text-muted-foreground text-xs">(Required for rejection, optional for approval)</span>
            </Label>
            <Textarea
              id="manager-comment"
              placeholder="Add your comments about this task completion..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="resize-none"
            />            
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              handleReject();
            }}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
          <Button
            onClick={() => {
              handleApprove();
            }}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
