import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OrganizationMember {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
}

export const useOrganizationMembers = (organizationId: string | null) => {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchMembers = async () => {
      if (!organizationId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from("users")
          .select("id, full_name, email, department")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("full_name");

        if (error) throw error;

        setMembers(data || []);
      } catch (error: any) {
        console.error("Error fetching organization members:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to fetch organization members",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [organizationId, toast]);

  return { members, loading };
};

