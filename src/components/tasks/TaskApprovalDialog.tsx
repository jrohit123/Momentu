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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:50',message:'Dialog useEffect triggered',data:{open,isSubmitting,onApproveType:typeof onApprove,onRejectType:typeof onReject},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    if (open) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:53',message:'Dialog opened - resetting form',data:{open},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      setComment("");
      setError("");
    }
  }, [open]);

  const handleApprove = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:57',message:'handleApprove called',data:{isSubmitting,comment:comment.trim()||undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setError("");
    setIsSubmitting(true);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:60',message:'isSubmitting set to true',data:{isSubmitting:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:62',message:'calling onApprove',data:{comment:comment.trim()||undefined,onApproveType:typeof onApprove},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      await onApprove(comment.trim() || undefined);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:64',message:'onApprove completed successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Dialog closing is handled by parent component after onApprove completes
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:68',message:'handleApprove error caught',data:{errorMessage:error?.message,errorType:error?.constructor?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setError(error.message || "Failed to approve task");
    } finally {
      setIsSubmitting(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:71',message:'isSubmitting set to false',data:{isSubmitting:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }
  };

  const handleReject = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:70',message:'handleReject called',data:{isSubmitting,comment:comment.trim()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setError("");
    
    // Validate that comment is provided for rejection
    if (!comment.trim()) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:75',message:'handleReject validation failed - no comment',data:{comment:comment.trim()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      setError("Comments are required when rejecting a task");
      return;
    }

    setIsSubmitting(true);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:80',message:'isSubmitting set to true',data:{isSubmitting:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:82',message:'calling onReject',data:{comment:comment.trim(),onRejectType:typeof onReject},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      await onReject(comment.trim());
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:84',message:'onReject completed successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Dialog closing is handled by parent component after onReject completes
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:88',message:'handleReject error caught',data:{errorMessage:error?.message,errorType:error?.constructor?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setError(error.message || "Failed to reject task");
    } finally {
      setIsSubmitting(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:91',message:'isSubmitting set to false',data:{isSubmitting:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
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
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:217',message:'Reject button clicked',data:{isSubmitting,disabled:isSubmitting},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
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
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/bbb89629-71d7-4d61-a454-300bbc1f308f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskApprovalDialog.tsx:225',message:'Approve button clicked',data:{isSubmitting,disabled:isSubmitting},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
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
