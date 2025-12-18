import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
}

export const useTeamMembers = (userId: string) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        setLoading(true);
        
        // Fetch employees where current user is the manager
        const { data: directReports, error: reportsError } = await supabase
          .from("users")
          .select("id, full_name, email, department")
          .eq("manager_id", userId)
          .eq("is_active", true);

        if (reportsError) throw reportsError;

        // Also include the current user for self-assignment
        const { data: self, error: selfError } = await supabase
          .from("users")
          .select("id, full_name, email, department")
          .eq("id", userId)
          .single();

        if (selfError) throw selfError;

        const members = [self, ...(directReports || [])];
        setTeamMembers(members);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchTeamMembers();
    } else {
      setLoading(false);
    }
  }, [userId, toast]);

  return { teamMembers, loading };
};
