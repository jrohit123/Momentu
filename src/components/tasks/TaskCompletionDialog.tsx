import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

interface TaskCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskName: string;
  benchmark: number | null;
  onSubmit: (status: TaskStatus, quantity?: number, notes?: string) => void;
}

export const TaskCompletionDialog = ({
  open,
  onOpenChange,
  taskName,
  benchmark,
  onSubmit,
}: TaskCompletionDialogProps) => {
  const [status, setStatus] = useState<TaskStatus>("completed");
  const [quantity, setQuantity] = useState<string>(benchmark?.toString() || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    // Validate mandatory comments for incomplete/partial/pending tasks
    const requiresNotes = status === "not_done" || status === "partial" || status === "pending";
    
    if (requiresNotes && !notes.trim()) {
      setError("Comments are mandatory for incomplete, partial, or pending tasks");
      return;
    }

    const quantityNum = quantity ? parseFloat(quantity) : undefined;
    onSubmit(status, quantityNum, notes.trim() || undefined);
    
    // Reset form
    setStatus("completed");
    setQuantity(benchmark?.toString() || "");
    setNotes("");
    setError("");
    onOpenChange(false);
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    setStatus(newStatus);
    setError("");
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

        <div className="space-y-4 py-4">
          {/* Status Selection */}
          <div className="space-y-2">
            <Label htmlFor="status">Status *</Label>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="partial">Partially Complete</SelectItem>
                <SelectItem value="not_done">Not Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quantity Completed */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Work Done {benchmark && `(Benchmark: ${benchmark})`}
            </Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter quantity completed"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {/* Notes/Comments */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Comments {(status === "not_done" || status === "partial" || status === "pending") && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="notes"
              placeholder={
                (status === "not_done" || status === "partial" || status === "pending")
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