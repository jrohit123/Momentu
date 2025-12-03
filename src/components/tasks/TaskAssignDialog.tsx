import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Users, Loader2 } from "lucide-react";

interface Task {
  id: string;
  name: string;
}

interface TaskAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  userId: string;
  onSuccess?: () => void;
}

export const TaskAssignDialog = ({
  open,
  onOpenChange,
  task,
  userId,
  onSuccess,
}: TaskAssignDialogProps) => {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [existingAssignees, setExistingAssignees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { teamMembers, loading } = useTeamMembers(userId);
  const { toast } = useToast();

  // Fetch existing assignments when dialog opens
  useEffect(() => {
    if (open && task) {
      fetchExistingAssignments();
    } else {
      setSelectedMembers([]);
      setExistingAssignees([]);
    }
  }, [open, task]);

  const fetchExistingAssignments = async () => {
    if (!task) return;

    const { data, error } = await supabase
      .from("task_assignments")
      .select("assigned_to")
      .eq("task_id", task.id);

    if (!error && data) {
      const assigneeIds = data.map((a) => a.assigned_to);
      setExistingAssignees(assigneeIds);
    }
  };

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSubmit = async () => {
    if (!task || selectedMembers.length === 0) return;

    try {
      setSubmitting(true);

      // Filter out already assigned members
      const newAssignees = selectedMembers.filter(
        (id) => !existingAssignees.includes(id)
      );

      if (newAssignees.length === 0) {
        toast({
          title: "No new assignments",
          description: "Selected members are already assigned to this task",
        });
        return;
      }

      // Create assignments
      const assignments = newAssignees.map((assigneeId) => ({
        task_id: task.id,
        assigned_to: assigneeId,
        assigned_by: userId,
        delegation_type: assigneeId === userId ? "self" : "manager",
      }));

      const { error } = await supabase
        .from("task_assignments")
        .insert(assignments);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Task assigned to ${newAssignees.length} member(s)`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const availableMembers = teamMembers.filter(
    (member) => !existingAssignees.includes(member.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Assign Task
          </DialogTitle>
          <DialogDescription>
            Assign <span className="font-medium text-foreground">{task?.name}</span> to team members
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {teamMembers.length === 0
                  ? "No team members found"
                  : "All team members are already assigned"}
              </p>
            </div>
          ) : (
            <>
              <Label>Select Team Members</Label>
              <ScrollArea className="h-[250px] border rounded-md p-3">
                <div className="space-y-2">
                  {availableMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleMemberToggle(member.id)}
                    >
                      <Checkbox
                        checked={selectedMembers.includes(member.id)}
                        onCheckedChange={() => handleMemberToggle(member.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium truncate">
                            {member.full_name}
                          </span>
                          {member.id === userId && (
                            <Badge variant="secondary" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email}
                        </p>
                        {member.department && (
                          <p className="text-xs text-muted-foreground">
                            {member.department}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              {selectedMembers.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedMembers.length} member(s) selected
                </p>
              )}
            </>
          )}

          {existingAssignees.length > 0 && (
            <div className="pt-2 border-t">
              <Label className="text-muted-foreground text-xs">
                Already Assigned ({existingAssignees.length})
              </Label>
              <div className="flex flex-wrap gap-1 mt-2">
                {teamMembers
                  .filter((m) => existingAssignees.includes(m.id))
                  .map((member) => (
                    <Badge key={member.id} variant="outline" className="text-xs">
                      {member.full_name}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedMembers.length === 0 || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              `Assign to ${selectedMembers.length || ""} Member${selectedMembers.length !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
