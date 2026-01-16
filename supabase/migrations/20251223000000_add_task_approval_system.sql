-- Add task approval system to task_completions table
-- Add approval_status and approved_by columns
ALTER TABLE public.task_completions
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.task_completions
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id);

-- Set existing completions to 'pending' status (as per user requirement)
UPDATE public.task_completions
SET approval_status = 'pending'
WHERE approval_status IS NULL;

-- Make approval_status NOT NULL after setting defaults
ALTER TABLE public.task_completions
ALTER COLUMN approval_status SET NOT NULL;

-- Create index on approval_status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_task_completions_approval_status
ON public.task_completions (approval_status);

-- Update RLS policies for task_completions to allow managers to approve/reject
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own completions" ON public.task_completions;
DROP POLICY IF EXISTS "Managers can view team completions" ON public.task_completions;
DROP POLICY IF EXISTS "Users can manage own completions" ON public.task_completions;

-- Recreate policies with approval capabilities
CREATE POLICY "Users can view own completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE id = task_completions.assignment_id
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "Managers can view team completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.users p ON ta.assigned_to = p.id
      WHERE ta.id = task_completions.assignment_id
      AND p.manager_id = auth.uid()
    )
  );

-- Users can manage their own completions (insert/update/delete)
CREATE POLICY "Users can manage own completions"
  ON public.task_completions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE id = task_completions.assignment_id
      AND assigned_to = auth.uid()
    )
  );

-- Managers can approve/reject completions for their team's tasks
CREATE POLICY "Managers can approve team completions"
  ON public.task_completions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    approval_status = 'pending' AND
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.users p ON ta.assigned_to = p.id
      WHERE ta.id = task_completions.assignment_id
      AND p.manager_id = auth.uid()
    )
  );

-- Update default organization settings to include auto_approve_tasks
-- First check if the function exists and update it, otherwise create it
CREATE OR REPLACE FUNCTION public.create_default_organization_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count int;
BEGIN
  -- Check if settings already exist for this organization
  SELECT COUNT(*) INTO existing_count
  FROM public.organization_settings
  WHERE organization_id = NEW.id;

  -- Only create defaults if no settings exist yet
  IF existing_count = 0 THEN
    -- Create default settings for new organizations
    INSERT INTO public.organization_settings (organization_id, setting_key, setting_value, setting_type, description)
    VALUES
      (NEW.id, 'timezone', 'Asia/Kolkata', 'text', 'Default timezone for date and time displays'),
      (NEW.id, 'date_format', 'YYYY-MM-DD', 'text', 'Format for displaying dates throughout the application'),
      (NEW.id, 'allow_upward_delegation', 'false', 'boolean', 'Allow users to assign tasks to their reporting manager or managers higher in the hierarchy'),
      (NEW.id, 'email_notification_time', '18:00', 'text', 'Time of day when daily completion summary emails are sent (24-hour format)'),
      (NEW.id, 'email_notification_day', 'same', 'text', 'Whether to send emails for same day or previous day completions'),
      (NEW.id, 'auto_approve_tasks', 'true', 'boolean', 'When enabled, task completions are automatically approved. When disabled, managers must approve each completion.');
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for new organizations (if it doesn't exist)
DROP TRIGGER IF EXISTS create_default_organization_settings_trigger ON public.organizations;
CREATE TRIGGER create_default_organization_settings_trigger
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_default_organization_settings();

-- Add the auto_approve_tasks setting to existing organizations that don't have it
INSERT INTO public.organization_settings (organization_id, setting_key, setting_value, setting_type, description)
SELECT DISTINCT
  o.id,
  'auto_approve_tasks',
  'true',
  'boolean',
  'When enabled, task completions are automatically approved. When disabled, managers must approve each completion.'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_settings os
  WHERE os.organization_id = o.id AND os.setting_key = 'auto_approve_tasks'
);
