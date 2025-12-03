import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type DayOfWeek = Database["public"]["Enums"]["day_of_week"];

interface PublicHoliday {
  id: string;
  holiday_name: string;
  holiday_date: string;
  description: string | null;
  is_recurring: boolean | null;
}

interface PersonalHoliday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  approval_status: string | null;
  approved_by: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    email: string;
  };
}

interface WeeklyOff {
  id: string;
  day_of_week: DayOfWeek;
  description: string | null;
}

export const useHolidays = (userId: string) => {
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [personalHolidays, setPersonalHolidays] = useState<PersonalHoliday[]>([]);
  const [teamHolidays, setTeamHolidays] = useState<PersonalHoliday[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOff[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchHolidays = async () => {
    try {
      setLoading(true);

      // Fetch public holidays
      const { data: pubHolidays, error: pubError } = await supabase
        .from("public_holidays")
        .select("*")
        .order("holiday_date", { ascending: true });

      if (pubError) throw pubError;
      setPublicHolidays(pubHolidays || []);

      // Fetch weekly offs
      const { data: weeklyData, error: weeklyError } = await supabase
        .from("weekly_offs")
        .select("*");

      if (weeklyError) throw weeklyError;
      setWeeklyOffs(weeklyData || []);

      // Fetch personal holidays for current user
      const { data: personalData, error: personalError } = await supabase
        .from("personal_holidays")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false });

      if (personalError) throw personalError;
      setPersonalHolidays(personalData || []);

      // Fetch team's personal holidays (for managers)
      const { data: teamData, error: teamError } = await supabase
        .from("personal_holidays")
        .select(`
          *,
          profile:profiles!personal_holidays_user_id_fkey (
            full_name,
            email
          )
        `)
        .neq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!teamError && teamData) {
        setTeamHolidays(teamData as PersonalHoliday[]);
      }
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

  useEffect(() => {
    if (userId) {
      fetchHolidays();
    }
  }, [userId]);

  // Public holiday operations (admin only)
  const addPublicHoliday = async (
    name: string,
    date: string,
    description?: string,
    isRecurring?: boolean
  ) => {
    const { error } = await supabase.from("public_holidays").insert({
      holiday_name: name,
      holiday_date: date,
      description,
      is_recurring: isRecurring ?? false,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }

    toast({ title: "Success", description: "Public holiday added" });
    fetchHolidays();
    return true;
  };

  const deletePublicHoliday = async (id: string) => {
    const { error } = await supabase.from("public_holidays").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }

    toast({ title: "Success", description: "Public holiday deleted" });
    fetchHolidays();
    return true;
  };

  // Weekly off operations (admin only)
  const addWeeklyOff = async (dayOfWeek: DayOfWeek, description?: string) => {
    const { error } = await supabase.from("weekly_offs").insert({
      day_of_week: dayOfWeek,
      description,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }

    toast({ title: "Success", description: "Weekly off added" });
    fetchHolidays();
    return true;
  };

  const deleteWeeklyOff = async (id: string) => {
    const { error } = await supabase.from("weekly_offs").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }

    toast({ title: "Success", description: "Weekly off removed" });
    fetchHolidays();
    return true;
  };

  // Personal holiday operations
  const requestPersonalHoliday = async (
    startDate: string,
    endDate: string,
    reason?: string
  ) => {
    const { error } = await supabase.from("personal_holidays").insert({
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      reason,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }

    toast({ title: "Success", description: "Leave request submitted" });
    fetchHolidays();
    return true;
  };

  const approvePersonalHoliday = async (id: string, approved: boolean) => {
    const { error } = await supabase
      .from("personal_holidays")
      .update({
        approval_status: approved ? "approved" : "rejected",
        approved_by: userId,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }

    toast({
      title: "Success",
      description: `Leave request ${approved ? "approved" : "rejected"}`,
    });
    fetchHolidays();
    return true;
  };

  return {
    publicHolidays,
    personalHolidays,
    teamHolidays,
    weeklyOffs,
    loading,
    addPublicHoliday,
    deletePublicHoliday,
    addWeeklyOff,
    deleteWeeklyOff,
    requestPersonalHoliday,
    approvePersonalHoliday,
    refresh: fetchHolidays,
  };
};
