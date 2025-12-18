-- Remove require_task_approval setting from organization_settings table
DELETE FROM public.organization_settings
WHERE setting_key = 'require_task_approval';

