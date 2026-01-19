import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, Building2, Save, Loader2 } from "lucide-react";

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  setting_type: "text" | "number" | "boolean" | "json";
  description: string | null;
}

interface SystemSettingsProps {
  user: User;
}

export const SystemSettings = ({ user }: SystemSettingsProps) => {
  const { isAdmin, loading: roleLoading } = useUserRole(user.id);
  const [organization, setOrganization] = useState<{ id: string; name: string } | null>(null);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Local state for settings (not saved yet)
  const [localSettings, setLocalSettings] = useState<Record<string, string | boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchOrganizationAndSettings();
    }
  }, [isAdmin, user.id]);

  const fetchOrganizationAndSettings = async () => {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) return;

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .single();

      if (org) {
        setOrganization(org);
        setOrgName(org.name);
      }

      const { data: orgSettings } = await supabase
        .from("organization_settings")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("setting_key");

      if (orgSettings) {
        setSettings(orgSettings);
        // Initialize local settings from fetched settings
        const initialLocalSettings: Record<string, string | boolean> = {};
        orgSettings.forEach((s) => {
          if (s.setting_type === "boolean") {
            initialLocalSettings[s.setting_key] = s.setting_value === "true";
          } else {
            initialLocalSettings[s.setting_key] = s.setting_value || "";
          }
        });
        setLocalSettings(initialLocalSettings);
        setHasUnsavedChanges(false);
      }
    } catch (error: any) {
      console.error("Error fetching organization and settings:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOrgNameUpdate = async () => {
    if (!organization || !orgName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: orgName.trim() })
        .eq("id", organization.id);

      if (error) throw error;

      setOrganization({ ...organization, name: orgName.trim() });
      toast({
        title: "Success",
        description: "Organization name updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update organization name",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSettingChange = (settingKey: string, value: string | boolean) => {
    setLocalSettings((prev) => ({
      ...prev,
      [settingKey]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveSettings = async () => {
    if (!organization) return;

    setSaving(true);
    try {
      // Save all local settings
      for (const [settingKey, value] of Object.entries(localSettings)) {
        const setting = settings.find((s) => s.setting_key === settingKey);
        const stringValue = typeof value === "boolean" ? value.toString() : value;

        if (setting) {
          // Update existing setting
          const { error } = await supabase
            .from("organization_settings")
            .update({ setting_value: stringValue })
            .eq("id", setting.id);

          if (error) throw error;

          setSettings(
            settings.map((s) => (s.id === setting.id ? { ...s, setting_value: stringValue } : s))
          );
        } else {
          // Create new setting
          const settingType = typeof value === "boolean" ? "boolean" : "string";
          const { data, error } = await supabase
            .from("organization_settings")
            .insert({
              organization_id: organization.id,
              setting_key: settingKey,
              setting_value: stringValue,
              setting_type: settingType,
            })
            .select()
            .single();

          if (error) throw error;

          setSettings([...settings, data]);
        }
      }

      setHasUnsavedChanges(false);
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getSettingValue = (key: string): string => {
    // Check local settings first (unsaved changes)
    if (localSettings[key] !== undefined) {
      return typeof localSettings[key] === "string" ? localSettings[key] as string : "";
    }
    const setting = settings.find((s) => s.setting_key === key);
    // Default to IST for timezone if no setting exists
    if (key === "timezone" && !setting?.setting_value) {
      return "Asia/Kolkata";
    }
    return setting?.setting_value || "";
  };

  const getSettingBoolean = (key: string): boolean => {
    // Check local settings first (unsaved changes)
    if (localSettings[key] !== undefined) {
      return typeof localSettings[key] === "boolean" ? localSettings[key] as boolean : false;
    }
    const setting = settings.find((s) => s.setting_key === key);
    return setting?.setting_value === "true";
  };

  const getSettingString = (key: string): string => {
    // Check local settings first (unsaved changes)
    if (localSettings[key] !== undefined) {
      return typeof localSettings[key] === "string" ? localSettings[key] as string : "";
    }
    const setting = settings.find((s) => s.setting_key === key);
    return setting?.setting_value || "";
  };

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Settings className="w-5 h-5" />
            Access Denied
          </CardTitle>
          <CardDescription>
            You don't have permission to access system settings. Only administrators can manage system settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Organization Information
          </CardTitle>
          <CardDescription>Update your organization's name and basic information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <div className="flex gap-2">
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Enter organization name"
                className="flex-1"
              />
              <Button onClick={handleOrgNameUpdate} disabled={saving || !orgName.trim()}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            System Settings
          </CardTitle>
          <CardDescription>Configure system-wide settings for your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timezone Setting */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={getSettingValue("timezone")}
              onValueChange={(value) => handleSettingChange("timezone", value)}
              disabled={saving}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                <SelectItem value="Europe/London">London (GMT)</SelectItem>
                <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                <SelectItem value="Asia/Kolkata">Mumbai (IST)</SelectItem>
                <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default timezone for date and time displays across the organization
            </p>
          </div>

          {/* Date Format Setting */}
          <div className="space-y-2">
            <Label htmlFor="date-format">Date Format</Label>
            <Select
              value={getSettingValue("date_format")}
              onValueChange={(value) => handleSettingChange("date_format", value)}
              disabled={saving}
            >
              <SelectTrigger id="date-format">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2025-12-15)</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/15/2025)</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (15/12/2025)</SelectItem>
                <SelectItem value="DD-MM-YYYY">DD-MM-YYYY (15-12-2025)</SelectItem>
                <SelectItem value="MMMM DD, YYYY">MMMM DD, YYYY (December 15, 2025)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Format for displaying dates throughout the application
            </p>
          </div>

          {/* Upward Delegation Setting */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="allow-upward-delegation">Allow Upward Delegation</Label>
              <p className="text-xs text-muted-foreground">
                Allow users to assign tasks to their reporting manager or managers higher in the hierarchy
              </p>
            </div>
            <Switch
              id="allow-upward-delegation"
              checked={getSettingBoolean("allow_upward_delegation")}
              onCheckedChange={(checked) => handleSettingChange("allow_upward_delegation", checked)}
              disabled={saving}
            />
          </div>

          {/* Auto-Approve Tasks Setting */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-approve-tasks">Auto-Approve Tasks</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, task completions are automatically approved. When disabled, managers must approve each completion.
              </p>
            </div>
            <Switch
              id="auto-approve-tasks"
              checked={getSettingBoolean("auto_approve_tasks")}
              onCheckedChange={(checked) => handleSettingChange("auto_approve_tasks", checked)}
              disabled={saving}
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={handleSaveSettings} 
              disabled={saving || !hasUnsavedChanges}
              className="min-w-[120px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications Card */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Configure daily task completion summary emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Notification Time */}
          <div className="space-y-2">
            <Label htmlFor="email-notification-time">Notification Time</Label>
            <Input
              id="email-notification-time"
              type="time"
              value={getSettingString("email_notification_time") || "18:00"}
              onChange={(e) => handleSettingChange("email_notification_time", e.target.value)}
              disabled={saving}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              Time of day when daily completion summary emails are sent (24-hour format)
            </p>
          </div>

          {/* Email Notification Day Preference */}
          <div className="space-y-2">
            <Label htmlFor="email-notification-day">Email Day Preference</Label>
            <Select
              value={getSettingString("email_notification_day") || "same"}
              onValueChange={(value) => handleSettingChange("email_notification_day", value)}
              disabled={saving}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">Same Day (End of day summary)</SelectItem>
                <SelectItem value="previous">Previous Day (Next morning summary)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {getSettingString("email_notification_day") === "previous" 
                ? "Emails will be sent the next morning for the previous day's tasks"
                : "Emails will be sent at the end of the day for that day's tasks"}
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={handleSaveSettings} 
              disabled={saving || !hasUnsavedChanges}
              className="min-w-[120px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

