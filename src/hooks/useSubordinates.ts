import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Subordinate {
  id: string;
  full_name: string;
  email: string;
  manager_id: string | null;
}

export const useSubordinates = (userId: string) => {
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubordinates();
  }, [userId]);

  const fetchSubordinates = async () => {
    try {
      setLoading(true);
      
      // Fetch all profiles where manager_id = userId (direct reports)
      const { data: directReports, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, manager_id")
        .eq("manager_id", userId)
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (error) throw error;

      // For now, we'll only show direct reports
      // The database function get_subordinates handles indirect reports for RLS
      // But for the UI, direct reports are sufficient
      setSubordinates(directReports || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch subordinates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    subordinates,
    loading,
    refresh: fetchSubordinates,
  };
};

