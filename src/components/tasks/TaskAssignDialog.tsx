import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Users, Loader2, AlertCircle, Search, Check, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DelegationTypeBadge } from "./DelegationTypeBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

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
  const [existingAssignments, setExistingAssignments] = useState<Map<string, string | null>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<{ manager_id: string | null; organization_id: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [removingAssigneeId, setRemovingAssigneeId] = useState<string | null>(null);
  const { members: organizationMembers = [], loading } = useOrganizationMembers(userProfile?.organization_id || null);
  const { settings: systemSettings, loading: settingsLoading } = useSystemSettings(userProfile?.organization_id || null);
  const { toast } = useToast();

  // Fetch user profile and existing assignments when dialog opens
  useEffect(() => {
    if (open && task) {
      fetchUserProfile();
      fetchExistingAssignments();
    } else {
      setSelectedMembers([]);
      setExistingAssignees([]);
      setUserProfile(null);
      setSearchQuery("");
      setSearchOpen(false);
    }
  }, [open, task, userId]);

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

  const fetchExistingAssignments = async () => {
    if (!task) return;

    const { data, error } = await supabase
      .from("task_assignments")
      .select("assigned_to, delegation_type")
      .eq("task_id", task.id);

    if (!error && data) {
      const assigneeIds = data.map((a) => a.assigned_to);
      const assignmentsMap = new Map<string, string | null>();
      data.forEach((a) => {
        assignmentsMap.set(a.assigned_to, a.delegation_type);
      });
      setExistingAssignees(assigneeIds);
      setExistingAssignments(assignmentsMap);
    }
  };

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleRemoveAssignee = async (assigneeId: string) => {
    if (!task) return;
    try {
      setRemovingAssigneeId(assigneeId);
      const wasLastAssignee = existingAssignees.length === 1;

      const { error: deleteError } = await supabase
        .from("task_assignments")
        .delete()
        .eq("task_id", task.id)
        .eq("assigned_to", assigneeId);

      if (deleteError) throw deleteError;

      if (wasLastAssignee) {
        const { error: insertError } = await supabase
          .from("task_assignments")
          .insert({
            task_id: task.id,
            assigned_to: userId,
            assigned_by: userId,
            delegation_type: "self",
          });
        if (insertError) throw insertError;
        toast({
          title: "Assigned to you",
          description: "You were the only assignee left, so the task is now assigned to you.",
        });
      } else {
        toast({
          title: "Removed",
          description: "Assignee removed from the task.",
        });
      }

      await fetchExistingAssignments();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRemovingAssigneeId(null);
    }
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

      // Determine delegation type for each assignment and validate upward delegation
      const assignments = await Promise.all(
        newAssignees.map(async (assigneeId) => {
          let delegationType: "self" | "downward" | "peer" | "upward" = "peer";

          if (assigneeId === userId) {
            delegationType = "self";
          } else {
            // Check if assignee is a manager (or higher) of the current user
            const { data: isManager } = await supabase.rpc("is_manager_of", {
              _manager_id: assigneeId,
              _subordinate_id: userId,
            });

            if (isManager) {
              // Validate that upward delegation is allowed
              if (!systemSettings.allow_upward_delegation) {
                throw new Error(
                  `Cannot assign task to ${organizationMembers.find((m) => m.id === assigneeId)?.full_name || "your manager"}. Upward delegation is disabled in your organization settings.`
                );
              }
              delegationType = "upward";
            } else {
              // Check if current user is a manager of the assignee
              const { data: isSubordinate } = await supabase.rpc("is_manager_of", {
                _manager_id: userId,
                _subordinate_id: assigneeId,
              });

              if (isSubordinate) {
                delegationType = "downward";
              } else {
                delegationType = "peer";
              }
            }
          }

          return {
            task_id: task.id,
            assigned_to: assigneeId,
            assigned_by: userId,
            delegation_type: delegationType,
          };
        })
      );

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

  // Filter members based on upward delegation setting
  const [managerCheckResults, setManagerCheckResults] = useState<Map<string, boolean>>(new Map());
  const [delegationTypes, setDelegationTypes] = useState<Map<string, "self" | "downward" | "peer" | "upward">>(new Map());

  useEffect(() => {
    if (!userProfile || settingsLoading || !organizationMembers.length) {
      setManagerCheckResults(new Map());
      setDelegationTypes(new Map());
      return;
    }

    const checkRelationships = async () => {
      const managerResults = new Map<string, boolean>();
      const delegationTypeMap = new Map<string, "self" | "downward" | "peer" | "upward">();
      
      for (const member of organizationMembers) {
        if (member.id === userId) {
          managerResults.set(member.id, false);
          delegationTypeMap.set(member.id, "self");
          continue;
        }

        // Use the database function to check if member is a manager (direct or indirect) of the user
        const { data: isManager } = await supabase.rpc("is_manager_of", {
          _manager_id: member.id,
          _subordinate_id: userId,
        });

        managerResults.set(member.id, isManager || false);

        if (isManager) {
          delegationTypeMap.set(member.id, "upward");
        } else {
          // Check if current user is a manager of the member
          const { data: isSubordinate } = await supabase.rpc("is_manager_of", {
            _manager_id: userId,
            _subordinate_id: member.id,
          });

          if (isSubordinate) {
            delegationTypeMap.set(member.id, "downward");
          } else {
            delegationTypeMap.set(member.id, "peer");
          }
        }
      }

      setManagerCheckResults(managerResults);
      setDelegationTypes(delegationTypeMap);
    };

    checkRelationships();
  }, [organizationMembers, userId, userProfile, settingsLoading]);

  // Filter searchable members based on upward delegation setting and search query
  const searchableMembers = useMemo(() => {
    if (settingsLoading || !userId) return [];

    let filtered = organizationMembers.filter((member) => {
      // Always allow self-assignment
      if (member.id === userId) return true;

      // Filter out already assigned members
      if (existingAssignees.includes(member.id)) return false;

      // If upward delegation is not allowed, filter out managers
      if (!systemSettings.allow_upward_delegation) {
        const isManager = managerCheckResults.get(member.id);
        if (isManager) return false;
      }

      return true;
    });

    // Filter by search query (minimum 3 characters)
    if (searchQuery.length >= 3) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((member) => 
        member.full_name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
      );
    } else {
      // If less than 3 characters, return empty array
      filtered = [];
    }

    return filtered;
  }, [organizationMembers, existingAssignees, userId, systemSettings.allow_upward_delegation, settingsLoading, managerCheckResults, searchQuery]);

  // Check if any managers were filtered out
  const hasFilteredManagers = useMemo(() => {
    if (settingsLoading || systemSettings.allow_upward_delegation) return false;
    
    return organizationMembers.some((member) => {
      if (member.id === userId) return false;
      if (existingAssignees.includes(member.id)) return false;
      return managerCheckResults.get(member.id) === true;
    });
  }, [organizationMembers, userId, systemSettings.allow_upward_delegation, settingsLoading, existingAssignees, managerCheckResults]);

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
          {hasFilteredManagers && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your manager(s) and their managers are not shown because upward delegation is disabled in your organization settings.
              </AlertDescription>
            </Alert>
          )}

          {/* Selected Members */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
              {selectedMembers.map((memberId) => {
                const member = organizationMembers.find((m) => m.id === memberId);
                if (!member) return null;
                return (
                  <Badge
                    key={memberId}
                    variant="secondary"
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <User className="w-3 h-3" />
                    <span>{member.full_name}</span>
                    {delegationTypes.has(memberId) && (
                      <DelegationTypeBadge
                        delegationType={delegationTypes.get(memberId) || null}
                        showIcon={false}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleMemberToggle(memberId)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Search Input with Autocomplete */}
          <div className="space-y-2">
            <Label>Search and Select People</Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search className="mr-2 h-4 w-4" />
                  {searchQuery.length >= 3
                    ? `Searching for "${searchQuery}"...`
                    : "Type at least 3 characters to search for people"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search by name or email (min 3 characters)..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    {loading || settingsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : searchQuery.length < 3 ? (
                      <CommandEmpty>
                        Type at least 3 characters to search
                      </CommandEmpty>
                    ) : searchableMembers.length === 0 ? (
                      <CommandEmpty>No people found matching "{searchQuery}"</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {searchableMembers.map((member) => {
                          const isSelected = selectedMembers.includes(member.id);
                          return (
                            <CommandItem
                              key={member.id}
                              value={`${member.full_name} ${member.email}`}
                              onSelect={() => {
                                handleMemberToggle(member.id);
                                setSearchQuery("");
                                setSearchOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium truncate">
                                    {member.full_name}
                                  </span>
                                  {member.id === userId && (
                                    <Badge variant="secondary" className="text-xs">
                                      You
                                    </Badge>
                                  )}
                                  {delegationTypes.has(member.id) && (
                                    <DelegationTypeBadge
                                      delegationType={delegationTypes.get(member.id) || null}
                                      showIcon={true}
                                    />
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
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {existingAssignees.length > 0 && (
            <div className="pt-2 border-t">
              <Label className="text-muted-foreground text-xs">
                Already Assigned ({existingAssignees.length})
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {organizationMembers
                  .filter((m) => existingAssignees.includes(m.id))
                  .map((member) => (
                    <div key={member.id} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs flex items-center gap-1 pr-1">
                        {member.full_name}
                        {existingAssignments.has(member.id) && (
                          <DelegationTypeBadge
                            delegationType={existingAssignments.get(member.id) as any}
                            showIcon={true}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignee(member.id)}
                          disabled={removingAssigneeId === member.id}
                          className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5 disabled:opacity-50"
                          title="Remove from task"
                        >
                          {removingAssigneeId === member.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                        </button>
                      </Badge>
                    </div>
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
