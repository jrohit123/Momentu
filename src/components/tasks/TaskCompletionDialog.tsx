import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface TaskCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskName: string;
  benchmark: number | null;
  description?: string | null;
  onSubmit: (status: TaskStatus, quantity?: number, notes?: string) => void;
}

export const TaskCompletionDialog = ({
  open,
  onOpenChange,
  taskName,
  benchmark,
  description,
  onSubmit,
}: TaskCompletionDialogProps) => {
  const [quantity, setQuantity] = useState<string>("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // Auto-determine status based on quantity vs benchmark
  const hasBenchmark = benchmark !== null && benchmark > 0;
  const quantityNum = quantity ? parseFloat(quantity) : 0;
  
  const derivedStatus: TaskStatus = hasBenchmark
    ? quantityNum >= benchmark
      ? "completed"
      : quantityNum > 0
        ? "partial"
        : "not_done"
    : quantityNum > 0
      ? "completed"
      : "not_done";

  const requiresNotes = derivedStatus === "not_done" || derivedStatus === "partial";

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setQuantity("1");
      setNotes("");
      setError("");
    }
  }, [open, benchmark]);

  const handleSubmit = () => {
    // Validate quantity is required when benchmark exists
    if (hasBenchmark && !quantity) {
      setError("Quantity is required for tasks with a benchmark");
      return;
    }

    // Validate mandatory comments for incomplete/partial tasks
    if (requiresNotes && !notes.trim()) {
      setError("Comments are mandatory for incomplete or partial tasks");
      return;
    }

    onSubmit(derivedStatus, quantityNum || undefined, notes.trim() || undefined);
    
    // Reset form
    setQuantity("1");
    setNotes("");
    setError("");
    onOpenChange(false);
  };

  const getStatusBadge = () => {
    switch (derivedStatus) {
      case "completed":
        return <Badge className="bg-success/10 text-success border-success/30">Will mark: Completed</Badge>;
      case "partial":
        return <Badge className="bg-warning/10 text-warning border-warning/30">Will mark: Partial</Badge>;
      case "not_done":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Will mark: Not Done</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Update Task Status</DialogTitle>
          <DialogDescription>
            Update the completion status for: <span className="font-medium text-foreground">{taskName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Task Description - Read Only */}
        {description && (
          <div className="space-y-2">
            <Label>Task Description</Label>
            <Textarea
              value={description}
              readOnly
              className="min-h-[80px] bg-muted cursor-not-allowed resize-none"
            />
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* Quantity Completed */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Work Done {hasBenchmark ? <span className="text-destructive">*</span> : null}
              {hasBenchmark && <span className="text-muted-foreground ml-1">(Benchmark: {benchmark})</span>}
            </Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              placeholder={hasBenchmark ? "Enter quantity completed (required)" : "Enter quantity completed"}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError("");
              }}
            />
            {hasBenchmark && (
              <p className="text-xs text-muted-foreground">
                Enter {benchmark} or more to mark as complete
              </p>
            )}
          </div>

          {/* Auto-determined Status Display */}
          <div className="space-y-2">
            <Label>Status (auto-determined)</Label>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {hasBenchmark && quantityNum > 0 && quantityNum < benchmark && (
                <span className="text-xs text-muted-foreground">
                  ({quantityNum}/{benchmark} = {Math.floor((quantityNum / benchmark) * 100)}%)
                </span>
              )}
            </div>
          </div>

          {/* Notes/Comments */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Comments {requiresNotes && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="notes"
              placeholder={
                requiresNotes
                  ? "Please provide a reason (required)"
                  : "Add any notes or comments (optional)"
              }
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError("");
              }}
              className="min-h-[100px]"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Update Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};