import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SystemSettings {
  timezone: string;
  date_format: string;
  allow_upward_delegation: boolean;
  auto_approve_tasks: boolean;
  email_notification_time?: string; // Format: "HH:mm" (24-hour format, e.g., "18:00" for 6 PM)
  email_notification_day?: string; // "same" or "previous" - whether to send for same day or previous day
}

export const useSystemSettings = (organizationId: string | null) => {
  const [settings, setSettings] = useState<SystemSettings>({
    timezone: "Asia/Kolkata",
    date_format: "YYYY-MM-DD",
    allow_upward_delegation: false,
    auto_approve_tasks: true, // Default to auto-approve for backward compatibility
    email_notification_time: "18:00", // Default 6 PM
    email_notification_day: "same", // Default same day
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("organization_settings")
          .select("setting_key, setting_value, setting_type")
          .eq("organization_id", organizationId);

        if (error) throw error;

        const settingsMap: Partial<SystemSettings> = {};
        data?.forEach((setting) => {
          if (setting.setting_type === "boolean") {
            settingsMap[setting.setting_key as keyof SystemSettings] = setting.setting_value === "true" as any;
          } else {
            settingsMap[setting.setting_key as keyof SystemSettings] = setting.setting_value as any;
          }
        });

        setSettings((prev) => ({
          ...prev,
          ...settingsMap,
        }));
      } catch (error) {
        console.error("Error fetching system settings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [organizationId]);

  return { settings, loading };
};

