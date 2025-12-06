import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, UserPlus, Users, Building2, Mail, Clock, X, Copy, Check, Network } from "lucide-react";
import { TeamHierarchy } from "./TeamHierarchy";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string;
  roles: AppRole[];
  manager_id: string | null;
  manager_name: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: AppRole;
  status: string;
  expires_at: string;
  token: string;
}

interface UserManagementProps {
  user: User;
}

export const UserManagement = ({ user }: UserManagementProps) => {
  const { isAdmin, loading: roleLoading } = useUserRole(user.id);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organization, setOrganization] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("employee");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchUsersAndOrg();
    }
  }, [isAdmin]);

  const fetchUsersAndOrg = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) return;

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .single();

      setOrganization(org);

      const { data: orgProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, manager_id")
        .eq("organization_id", profile.organization_id);

      if (!orgProfiles) return;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", profile.organization_id);

      const usersWithRoles: UserWithRoles[] = orgProfiles.map((p) => {
        const manager = orgProfiles.find((m) => m.id === p.manager_id);
        return {
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          roles: roles?.filter((r) => r.user_id === p.id).map((r) => r.role) || [],
          manager_id: p.manager_id,
          manager_name: manager?.full_name || null,
        };
      });

      setUsers(usersWithRoles);

      // Fetch pending invitations
      const { data: invites } = await supabase
        .from("invitations")
        .select("id, email, role, status, expires_at, token")
        .eq("organization_id", profile.organization_id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      setInvitations(invites || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    if (!organization) return;

    try {
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", organization.id);

      const { error } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: newRole,
        organization_id: organization.id,
      });

      if (error) throw error;

      toast({ title: "Role updated successfully" });
      fetchUsersAndOrg();
    } catch (error: any) {
      toast({
        title: "Error updating role",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleManagerChange = async (userId: string, managerId: string | null) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ manager_id: managerId === "none" ? null : managerId })
        .eq("id", userId);

      if (error) throw error;

      toast({ title: "Manager updated successfully" });
      fetchUsersAndOrg();
    } catch (error: any) {
      toast({
        title: "Error updating manager",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleInvite = async () => {
    if (!organization || !inviteEmail.trim()) return;

    setInviting(true);
    try {
      // Get current user's profile for inviter name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const { data, error } = await supabase
        .from("invitations")
        .insert({
          email: inviteEmail.trim().toLowerCase(),
          organization_id: organization.id,
          invited_by: user.id,
          role: inviteRole,
        })
        .select("token")
        .single();

      if (error) throw error;

      // Send invitation email
      try {
        await supabase.functions.invoke("send-invitation-email", {
          body: {
            email: inviteEmail.trim().toLowerCase(),
            inviterName: profile?.full_name || "A team member",
            organizationName: organization.name,
            role: inviteRole,
            invitationToken: data.token,
            appUrl: window.location.origin,
          },
        });

        toast({
          title: "Invitation sent!",
          description: `An invitation email has been sent to ${inviteEmail}`,
        });
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        toast({
          title: "Invitation created",
          description: "Email sending failed. Share the link manually.",
        });
      }

      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("employee");
      fetchUsersAndOrg();
    } catch (error: any) {
      toast({
        title: "Error creating invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from("invitations")
        .delete()
        .eq("id", invitationId);

      if (error) throw error;

      toast({ title: "Invitation cancelled" });
      fetchUsersAndOrg();
    } catch (error: any) {
      toast({
        title: "Error cancelling invitation",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/auth?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case "admin":
        return "default";
      case "manager":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Shield className="w-5 h-5" />
            Access Denied
          </CardTitle>
          <CardDescription>
            You don't have permission to access user management. Only administrators can manage users.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Organization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-medium">{organization?.name || "Unknown Organization"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {users.length} member{users.length !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Tabs for different admin sections */}
      <Tabs defaultValue="members" className="space-y-6">
        <TabsList>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="hierarchy" className="flex items-center gap-2">
            <Network className="w-4 h-4" />
            Hierarchy
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Invitations
          </TabsTrigger>
        </TabsList>

        {/* Team Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Team Members
              </CardTitle>
              <CardDescription>
                Manage user roles within your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const managers = users.filter(
                      (m) => m.id !== u.id && m.roles.includes("manager")
                    );
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.full_name}
                          {u.id === user.id && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              You
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.roles[0] || "employee"}
                            onValueChange={(value) => handleRoleChange(u.id, value as AppRole)}
                            disabled={u.id === user.id}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="employee">Employee</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.manager_id || "none"}
                            onValueChange={(value) => handleManagerChange(u.id, value)}
                            disabled={u.roles.includes("admin")}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue placeholder="No manager" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No manager</SelectItem>
                              {managers.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {u.roles.map((role) => (
                              <Badge key={role} variant={getRoleBadgeVariant(role)}>
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hierarchy Tab */}
        <TabsContent value="hierarchy">
          <TeamHierarchy user={user} />
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Pending Invitations
                </CardTitle>
                <CardDescription>
                  Manage invitation links for new team members
                </CardDescription>
              </div>
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Mail className="w-4 h-4 mr-2" />
                    Invite User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite New User</DialogTitle>
                    <DialogDescription>
                      Create an invitation link to add a new team member to {organization?.name}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? "Sending..." : "Send Invitation"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No pending invitations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{inv.email}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Expires {new Date(inv.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={getRoleBadgeVariant(inv.role)}>{inv.role}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(inv.token)}
                        >
                          {copiedToken === inv.token ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelInvitation(inv.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};