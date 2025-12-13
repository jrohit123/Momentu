-- Update all 'employee' roles to 'user'
-- This must be run after the enum value is added
UPDATE public.user_roles
SET role = 'user'::app_role
WHERE role = 'employee'::app_role;

-- Update all 'manager' roles to 'user'
UPDATE public.user_roles
SET role = 'user'::app_role
WHERE role = 'manager'::app_role;

-- Note: PostgreSQL doesn't allow removing enum values, so 'employee' and 'manager' 
-- will remain in the enum type definition but should not be used going forward.
-- Only 'user' and 'admin' should be used for new records.

