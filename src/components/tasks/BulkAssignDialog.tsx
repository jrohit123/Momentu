import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Users, Loader2, AlertCircle, Check, X, ChevronDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DelegationTypeBadge } from "./DelegationTypeBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  name: string;
}

interface BulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  userId: string;
  onSuccess?: () => void;
}

export const BulkAssignDialog = ({
  open,
  onOpenChange,
  tasks,
  userId,
  onSuccess,
}: BulkAssignDialogProps) => {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<{ manager_id: string | null; organization_id: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [unassignMe, setUnassignMe] = useState(false);
  const orgId = userProfile?.organization_id || null;
  const { members: organizationMembers = [], loading } = useOrganizationMembers(orgId);
  const { settings: systemSettings, loading: settingsLoading } = useSystemSettings(userProfile?.organization_id || null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && tasks.length > 0) {
      fetchUserProfile();
    } else {
      setSelectedMembers([]);
      setUserProfile(null);
      setSearchQuery("");
      setSearchOpen(false);
      setUnassignMe(false);
    }
  }, [open, tasks, userId]);

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("manager_id, organization_id")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error: any) {
      console.error("Error fetching user profile:", error);
    }
  };

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Get manager hierarchy for delegation type determination
  const managerCheckResults = useMemo(() => {
    const results = new Map<string, boolean>();
    if (!userProfile?.manager_id || !organizationMembers.length) return results;

    const checkIsManager = (userId: string, targetId: string, visited = new Set<string>()): boolean => {
      if (visited.has(userId)) return false;
      visited.add(userId);

      const user = organizationMembers.find((m) => m.id === userId);
      if (!user || !user.manager_id) return false;

      if (user.manager_id === targetId) return true;
      return checkIsManager(user.manager_id, targetId, visited);
    };

    organizationMembers.forEach((member) => {
      if (member.id === userId) {
        results.set(member.id, false); // Self
      } else if (member.manager_id === userId) {
        results.set(member.id, false); // Direct report
      } else if (userProfile.manager_id && checkIsManager(userId, member.id)) {
        results.set(member.id, true); // Manager or higher
      } else {
        results.set(member.id, false); // Peer
      }
    });

    return results;
  }, [organizationMembers, userId, userProfile?.manager_id]);

  const delegationTypes = useMemo(() => {
    const types = new Map<string, "self" | "downward" | "peer" | "upward">();
    
    selectedMembers.forEach((memberId) => {
      if (memberId === userId) {
        types.set(memberId, "self");
      } else {
        const member = organizationMembers.find((m) => m.id === memberId);
        if (member?.manager_id === userId) {
          types.set(memberId, "downward");
        } else if (managerCheckResults.get(memberId)) {
          types.set(memberId, "upward");
        } else {
          types.set(memberId, "peer");
        }
      }
    });

    return types;
  }, [selectedMembers, organizationMembers, userId, managerCheckResults]);

  const safeSystemSettings = useMemo(() => {
    return {
      allow_upward_delegation: systemSettings?.allow_upward_delegation ?? false,
    };
  }, [systemSettings]);

  const availableMembers = useMemo(() => {
    if (settingsLoading || !userId) return [];

    return organizationMembers.filter((member) => {
      if (member.id === userId) return true;
      if (!safeSystemSettings.allow_upward_delegation) {
        const isManager = managerCheckResults.get(member.id);
        if (isManager) return false;
      }
      return true;
    });
  }, [organizationMembers, userId, safeSystemSettings.allow_upward_delegation, settingsLoading, managerCheckResults]);

  const searchableMembers = useMemo(() => {
    if (settingsLoading || !userId) return [];

    let filtered = availableMembers;

    // Filter by search query (minimum 3 characters)
    if (searchQuery.length >= 3) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((member) => 
        member.full_name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
      );
    } else {
      filtered = [];
    }
    return filtered;
  }, [availableMembers, searchQuery, settingsLoading, userId]);

  const hasFilteredManagers = useMemo(() => {
    if (safeSystemSettings.allow_upward_delegation) return false;
    return organizationMembers.some((member) => {
      if (member.id === userId) return false;
      return managerCheckResults.get(member.id) === true;
    });
  }, [organizationMembers, userId, safeSystemSettings.allow_upward_delegation, managerCheckResults]);

  const handleSubmit = async () => {
    if (selectedMembers.length === 0) {
      toast({
        title: "No members selected",
        description: "Please select at least one team member to assign tasks to",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      // Validate upward delegation
      const upwardDelegations = Array.from(delegationTypes.values()).filter((type) => type === "upward");
      if (upwardDelegations.length > 0 && !safeSystemSettings.allow_upward_delegation) {
        toast({
          title: "Upward delegation not allowed",
          description: "Your organization settings do not allow assigning tasks to managers",
          variant: "destructive",
        });
        return;
      }

      // Get existing assignments for all tasks to avoid duplicates
      const { data: existingAssignments, error: existingError } = await supabase
        .from("task_assignments")
        .select("task_id, assigned_to")
        .in("task_id", tasks.map((t) => t.id));

      if (existingError) throw existingError;

      const existingSet = new Set(
        (existingAssignments || []).map((a) => `${a.task_id}-${a.assigned_to}`)
      );

      // Create assignments for all selected tasks and members
      const assignmentsToCreate: Array<{
        task_id: string;
        assigned_to: string;
        assigned_by: string;
        delegation_type: string;
      }> = [];

      tasks.forEach((task) => {
        selectedMembers.forEach((memberId) => {
          const key = `${task.id}-${memberId}`;
          if (!existingSet.has(key)) {
            assignmentsToCreate.push({
              task_id: task.id,
              assigned_to: memberId,
              assigned_by: userId,
              delegation_type: delegationTypes.get(memberId) || "peer",
            });
          }
        });
      });

      if (assignmentsToCreate.length === 0) {
        toast({
          title: "No new assignments",
          description: "All selected members are already assigned to all selected tasks",
        });
        return;
      }

      const { error: insertError } = await supabase
        .from("task_assignments")
        .insert(assignmentsToCreate);

      if (insertError) throw insertError;

      let unassignSucceeded = true;
      if (unassignMe && tasks.length > 0) {
        const { error: unassignError } = await supabase
          .from("task_assignments")
          .delete()
          .in("task_id", tasks.map((t) => t.id))
          .eq("assigned_to", userId);
        if (unassignError) {
          unassignSucceeded = false;
          toast({
            title: "Assignments added, unassign failed",
            description: unassignError.message,
            variant: "destructive",
          });
        }
      }

      if (unassignSucceeded) {
        toast({
          title: "Tasks assigned successfully",
          description: unassignMe
            ? `${assignmentsToCreate.length} assignment(s) created and you were removed from ${tasks.length} task(s)`
            : `${assignmentsToCreate.length} assignment(s) created for ${tasks.length} task(s)`,
        });
      }

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        title: "Error assigning tasks",
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Assign Tasks</DialogTitle>
          <DialogDescription>
            Assign {tasks.length} task{tasks.length > 1 ? "s" : ""} to team members
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

          {/* Unassign me option - show when assigning to someone else */}
          {selectedMembers.some((id) => id !== userId) && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="unassign-me-bulk"
                checked={unassignMe}
                onCheckedChange={(checked) => setUnassignMe(checked === true)}
              />
              <Label
                htmlFor="unassign-me-bulk"
                className="text-sm font-normal cursor-pointer"
              >
                Also remove myself from these tasks
              </Label>
            </div>
          )}

          {/* Assign To Section */}
          {userId && (
            <div className="space-y-3 pt-4 border-t">
              <Label>Assign To</Label>
              <p className="text-sm text-muted-foreground">
                Select team members to assign these tasks to
              </p>
              
              {hasFilteredManagers && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your manager(s) are not shown because upward delegation is disabled in your organization settings.
                  </AlertDescription>
                </Alert>
              )}

              {(loading || settingsLoading || (open && tasks.length > 0 && !userProfile)) ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedMembers.map((memberId) => {
                      const member = organizationMembers.find((m) => m.id === memberId);
                      if (!member) return null;
                      return (
                        <Badge key={memberId} variant="secondary" className="pr-1">
                          {member.full_name}
                          {delegationTypes.has(memberId) && (
                            <DelegationTypeBadge
                              delegationType={delegationTypes.get(memberId) || null}
                              showIcon={true}
                              className="ml-1"
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-auto w-auto p-0 ml-1 text-muted-foreground hover:text-foreground"
                            onClick={() => handleMemberToggle(memberId)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      );
                    })}
                  </div>

                  <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={searchOpen}
                        className="w-full justify-between"
                      >
                        {selectedMembers.length > 0
                          ? `${selectedMembers.length} selected`
                          : "Select assignees..."}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search members..."
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList>
                          {searchQuery.length < 3 ? (
                            <CommandEmpty>Type at least 3 characters to search</CommandEmpty>
                          ) : searchableMembers.length === 0 ? (
                            <CommandEmpty>No member found.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {searchableMembers.map((member) => (
                                <CommandItem
                                  key={member.id}
                                  value={`${member.full_name} ${member.email}`}
                                  onSelect={() => handleMemberToggle(member.id)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedMembers.includes(member.id) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex items-center gap-2">
                                    {member.full_name}
                                    {delegationTypes.has(member.id) && (
                                      <DelegationTypeBadge
                                        delegationType={delegationTypes.get(member.id) || null}
                                        showIcon={true}
                                      />
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || selectedMembers.length === 0}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Users className="w-4 h-4 mr-2" />
                Assign Tasks
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

