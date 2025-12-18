-- Add default email notification settings to existing organizations
INSERT INTO public.organization_settings (organization_id, setting_key, setting_value, setting_type)
SELECT 
  id,
  'email_notification_time',
  '18:00',
  'string'
FROM public.organizations
WHERE id NOT IN (
  SELECT organization_id 
  FROM public.organization_settings 
  WHERE setting_key = 'email_notification_time'
)
ON CONFLICT (organization_id, setting_key) DO NOTHING;

INSERT INTO public.organization_settings (organization_id, setting_key, setting_value, setting_type)
SELECT 
  id,
  'email_notification_day',
  'same',
  'string'
FROM public.organizations
WHERE id NOT IN (
  SELECT organization_id 
  FROM public.organization_settings 
  WHERE setting_key = 'email_notification_day'
)
ON CONFLICT (organization_id, setting_key) DO NOTHING;

-- Update the trigger function to include email notification settings
CREATE OR REPLACE FUNCTION public.create_default_organization_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id, setting_key, setting_value, setting_type)
  VALUES
    (NEW.id, 'timezone', 'Asia/Kolkata', 'string'),
    (NEW.id, 'date_format', 'YYYY-MM-DD', 'string'),
    (NEW.id, 'allow_upward_delegation', 'false', 'boolean'),
    (NEW.id, 'email_notification_time', '18:00', 'string'),
    (NEW.id, 'email_notification_day', 'same', 'string');
  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists and create new one
DROP TRIGGER IF EXISTS create_default_system_settings_trigger ON public.organizations;
DROP TRIGGER IF EXISTS create_default_organization_settings_trigger ON public.organizations;

CREATE TRIGGER create_default_organization_settings_trigger
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.create_default_organization_settings();

-- Note: To schedule daily summary emails, you have a few options:
-- 
-- Option 1: Use Supabase's pg_cron extension (if available)
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule(
--     'send-daily-summaries',
--     '*/5 * * * *', -- Every 5 minutes
--     $$
--     SELECT net.http_post(
--       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-summary',
--       headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--       body := '{}'::jsonb
--     );
--     $$
--   );
--
-- Option 2: Use an external cron service (like cron-job.org, EasyCron, etc.)
--   to call: POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-summary
--   with headers: Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--
-- Option 3: Use Supabase's Database Webhooks (if available)
--   to trigger on a schedule

