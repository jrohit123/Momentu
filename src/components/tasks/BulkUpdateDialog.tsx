import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Edit } from "lucide-react";

interface Task {
  id: string;
  name: string;
  category: string | null;
  benchmark: number | null;
}

interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  userId: string;
  onSuccess?: () => void;
}

export const BulkUpdateDialog = ({
  open,
  onOpenChange,
  tasks,
  userId,
  onSuccess,
}: BulkUpdateDialogProps) => {
  const [category, setCategory] = useState<string>("");
  const [benchmark, setBenchmark] = useState<string>("");
  const [updateCategory, setUpdateCategory] = useState(false);
  const [updateBenchmark, setUpdateBenchmark] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && tasks.length > 0) {
      // Reset form
      setCategory("");
      setBenchmark("");
      setUpdateCategory(false);
      setUpdateBenchmark(false);
    }
  }, [open, tasks]);

  const handleSubmit = async () => {
    if (!updateCategory && !updateBenchmark) {
      toast({
        title: "No changes selected",
        description: "Please select at least one field to update",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      const updates: { category?: string | null; benchmark?: number | null } = {};

      if (updateCategory) {
        updates.category = category.trim() || null;
      }

      if (updateBenchmark) {
        const benchmarkNum = benchmark.trim() ? parseFloat(benchmark.trim()) : null;
        if (benchmarkNum !== null && (isNaN(benchmarkNum) || benchmarkNum <= 0)) {
          toast({
            title: "Invalid benchmark",
            description: "Benchmark must be a positive number",
            variant: "destructive",
          });
          return;
        }
        updates.benchmark = benchmarkNum;
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .in("id", tasks.map((t) => t.id))
        .eq("created_by", userId);

      if (error) throw error;

      const changes: string[] = [];
      if (updateCategory) {
        changes.push(`category: ${updates.category || "removed"}`);
      }
      if (updateBenchmark) {
        changes.push(`benchmark: ${updates.benchmark || "removed"}`);
      }

      toast({
        title: "Tasks updated successfully",
        description: `Updated ${tasks.length} task(s): ${changes.join(", ")}`,
      });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        title: "Error updating tasks",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (tasks.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Update Tasks</DialogTitle>
          <DialogDescription>
            Update {tasks.length} task{tasks.length > 1 ? "s" : ""} at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected Tasks List */}
          <div className="space-y-2">
            <Label>Selected Tasks</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
              {tasks.map((task) => (
                <Badge key={task.id} variant="secondary">
                  {task.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Category Update */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="update-category"
                checked={updateCategory}
                onCheckedChange={(checked) => setUpdateCategory(checked === true)}
              />
              <Label htmlFor="update-category" className="font-normal cursor-pointer">
                Update Category
              </Label>
            </div>
            {updateCategory && (
              <Input
                placeholder="Enter category (leave empty to remove)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
              />
            )}
          </div>

          {/* Benchmark Update */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="update-benchmark"
                checked={updateBenchmark}
                onCheckedChange={(checked) => setUpdateBenchmark(checked === true)}
              />
              <Label htmlFor="update-benchmark" className="font-normal cursor-pointer">
                Update Benchmark
              </Label>
            </div>
            {updateBenchmark && (
              <Input
                type="number"
                placeholder="Enter benchmark (leave empty to remove)"
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value)}
                disabled={submitting}
                min="0"
                step="0.01"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || (!updateCategory && !updateBenchmark)}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Edit className="w-4 h-4 mr-2" />
                Update Tasks
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

