import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export const useUserRole = (userId: string) => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [hasSubordinates, setHasSubordinates] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoles = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      // First get user's organization
      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", userId)
        .single();

      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id);

        // Get roles for this user in their organization
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("organization_id", profile.organization_id);

        if (!error && data) {
          setRoles(data.map((r) => r.role));
        }
      }

      // Check if user has any subordinates (is a manager)
      const { data: subordinates } = await supabase
        .from("users")
        .select("id")
        .eq("manager_id", userId)
        .limit(1);

      setHasSubordinates((subordinates?.length || 0) > 0);
      setLoading(false);
    };

    fetchRoles();
  }, [userId]);

  const isAdmin = roles.includes("admin");
  const isManager = hasSubordinates; // User is a manager if they have subordinates
  const isEmployee = roles.includes("user"); // Changed from "employee" to "user"

  return { roles, isAdmin, isManager, isEmployee, organizationId, loading };
};
