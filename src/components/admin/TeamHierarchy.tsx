import { useState, useEffect, useMemo } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, User as UserIcon, Users, ChevronDown, ChevronRight } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  manager_id: string | null;
  roles: AppRole[];
}

interface HierarchyNode {
  member: TeamMember;
  directReports: HierarchyNode[];
}

interface TeamHierarchyProps {
  user: User;
}

export const TeamHierarchy = ({ user }: TeamHierarchyProps) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) return;

      const { data: users } = await supabase
        .from("users")
        .select("id, email, full_name, department, manager_id")
        .eq("organization_id", profile.organization_id);

      if (!users) return;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", profile.organization_id);

      const membersWithRoles: TeamMember[] = users.map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        department: p.department,
        manager_id: p.manager_id,
        roles: roles?.filter((r) => r.user_id === p.id).map((r) => r.role) || [],
      }));

      setMembers(membersWithRoles);
      
      // Expand all nodes by default
      const allIds = new Set(membersWithRoles.map(m => m.id));
      setExpandedNodes(allIds);
    } catch (error) {
      console.error("Error fetching team members:", error);
    } finally {
      setLoading(false);
    }
  };

  const hierarchy = useMemo(() => {
    const buildHierarchy = (managerId: string | null): HierarchyNode[] => {
      return members
        .filter((m) => m.manager_id === managerId)
        .map((member) => ({
          member,
          directReports: buildHierarchy(member.id),
        }));
    };

    // Find top-level members (no manager or manager not in org)
    const topLevel = members.filter(
      (m) => !m.manager_id || !members.find((other) => other.id === m.manager_id)
    );

    return topLevel.map((member) => ({
      member,
      directReports: buildHierarchy(member.id),
    }));
  }, [members]);

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleColor = (role: AppRole) => {
    switch (role) {
      case "admin":
        return "bg-primary/10 text-primary border-primary/30";
      case "manager":
        return "bg-secondary/10 text-secondary-foreground border-secondary/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const renderNode = (node: HierarchyNode, depth: number = 0) => {
    const { member, directReports } = node;
    const isExpanded = expandedNodes.has(member.id);
    const hasReports = directReports.length > 0;

    return (
      <div key={member.id} className="relative">
        {/* Connection line from parent */}
        {depth > 0 && (
          <div
            className="absolute left-0 top-0 w-6 border-l-2 border-b-2 border-border rounded-bl-lg"
            style={{ height: "28px", marginLeft: "-12px" }}
          />
        )}

        <div
          className={`
            flex items-center gap-3 p-3 rounded-lg border border-border bg-card
            hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer
            ${depth > 0 ? "ml-6" : ""}
          `}
          onClick={() => hasReports && toggleNode(member.id)}
        >
          {/* Expand/collapse indicator */}
          {hasReports ? (
            <button className="p-1 hover:bg-muted rounded">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Avatar */}
          <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(member.full_name)}
            </AvatarFallback>
          </Avatar>

          {/* Member info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground truncate">
                {member.full_name}
              </span>
              {member.id === user.id && (
                <Badge variant="outline" className="text-xs">You</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate">{member.email}</span>
              {member.department && (
                <>
                  <span>•</span>
                  <span>{member.department}</span>
                </>
              )}
            </div>
          </div>

          {/* Role badges */}
          <div className="flex items-center gap-2">
            {member.roles.map((role) => (
              <Badge
                key={role}
                variant="outline"
                className={getRoleColor(role)}
              >
                {role}
              </Badge>
            ))}
            {hasReports && (
              <Badge variant="secondary" className="text-xs">
                <Users className="w-3 h-3 mr-1" />
                {directReports.length}
              </Badge>
            )}
          </div>
        </div>

        {/* Direct reports */}
        {hasReports && isExpanded && (
          <div className="relative ml-6 mt-2 space-y-2 pl-6 border-l-2 border-border">
            {directReports.map((report) => renderNode(report, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Team Hierarchy
        </CardTitle>
        <CardDescription>
          View the organizational structure and reporting relationships
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <UserIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No team members found</p>
          </div>
        ) : hierarchy.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hierarchy structure defined yet</p>
            <p className="text-sm">Assign managers to team members to see the hierarchy</p>
          </div>
        ) : (
          <div className="space-y-3">
            {hierarchy.map((node) => renderNode(node))}
          </div>
        )}

      </CardContent>
    </Card>
  );
};
