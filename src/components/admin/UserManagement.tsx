import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Shield, UserPlus, Users, Building2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string;
  roles: AppRole[];
}

interface UserManagementProps {
  user: User;
}

export const UserManagement = ({ user }: UserManagementProps) => {
  const { isAdmin, loading: roleLoading } = useUserRole(user.id);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [organization, setOrganization] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchUsersAndOrg();
    }
  }, [isAdmin]);

  const fetchUsersAndOrg = async () => {
    try {
      // Get current user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) return;

      // Get organization details
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .single();

      setOrganization(org);

      // Get all users in the organization
      const { data: orgProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("organization_id", profile.organization_id);

      if (!orgProfiles) return;

      // Get roles for all users
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", profile.organization_id);

      const usersWithRoles: UserWithRoles[] = orgProfiles.map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        roles: roles?.filter((r) => r.user_id === p.id).map((r) => r.role) || [],
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    if (!organization) return;

    try {
      // Remove existing roles for this user in this org
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", organization.id);

      // Add the new role
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

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Members
          </CardTitle>
          <CardDescription>
            Manage user roles within your organization. Assign admin, manager, or employee roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Change Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
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
                    <div className="flex gap-1">
                      {u.roles.map((role) => (
                        <Badge key={role} variant={getRoleBadgeVariant(role)}>
                          {role}
                        </Badge>
                      ))}
                      {u.roles.length === 0 && (
                        <Badge variant="outline">No role</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.roles[0] || "employee"}
                      onValueChange={(value) => handleRoleChange(u.id, value as AppRole)}
                      disabled={u.id === user.id}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium flex items-center gap-2 mb-2">
              <UserPlus className="w-4 h-4" />
              Adding New Users
            </h4>
            <p className="text-sm text-muted-foreground">
              New users can sign up using the authentication page. They will automatically be added to your organization and assigned the employee role. You can then change their role here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
