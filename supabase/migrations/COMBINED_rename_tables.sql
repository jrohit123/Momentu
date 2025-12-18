-- ============================================================================
-- COMBINED MIGRATION: Rename system_settings to organization_settings
--                    and profiles to users
-- ============================================================================
-- Run this script in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: Create or rename system_settings to organization_settings
-- ============================================================================

-- Check if system_settings exists and rename it, otherwise create organization_settings
DO $$
BEGIN
  -- Check if system_settings table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_settings') THEN
    -- Rename system_settings to organization_settings
    ALTER TABLE public.system_settings RENAME TO organization_settings;
  ELSIF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_settings') THEN
    -- Create organization_settings table if it doesn't exist
    CREATE TABLE public.organization_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      setting_type TEXT NOT NULL CHECK (setting_type IN ('string', 'boolean', 'number')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (organization_id, setting_key)
    );
    
    -- Enable RLS
    ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Update RLS policies (drop old policy if it exists)
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.organization_settings;
DROP POLICY IF EXISTS "Admins can manage organization settings" ON public.organization_settings;

-- Create the RLS policy (will be updated in Part 3 after users table is renamed)
CREATE POLICY "Admins can manage organization settings"
  ON public.organization_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- ============================================================================
-- PART 2: Rename profiles to users
-- ============================================================================

-- Rename profiles table to users
ALTER TABLE public.profiles RENAME TO users;

-- Update self-referencing foreign key constraint
ALTER TABLE public.users 
  DROP CONSTRAINT IF EXISTS profiles_manager_id_fkey,
  ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(id);

-- Update foreign key constraint for organization_id (if it references profiles)
ALTER TABLE public.users 
  DROP CONSTRAINT IF EXISTS profiles_organization_id_fkey;

-- Update foreign key in user_roles table
ALTER TABLE public.user_roles 
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
  ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Update foreign key in personal_holidays table
ALTER TABLE public.personal_holidays 
  DROP CONSTRAINT IF EXISTS personal_holidays_user_id_fkey,
  ADD CONSTRAINT personal_holidays_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.personal_holidays 
  DROP CONSTRAINT IF EXISTS personal_holidays_approved_by_fkey,
  ADD CONSTRAINT personal_holidays_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

-- Update foreign key in tasks table
ALTER TABLE public.tasks 
  DROP CONSTRAINT IF EXISTS tasks_created_by_fkey,
  ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

-- Update foreign key in task_assignments table
ALTER TABLE public.task_assignments 
  DROP CONSTRAINT IF EXISTS task_assignments_assigned_to_fkey,
  ADD CONSTRAINT task_assignments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.task_assignments 
  DROP CONSTRAINT IF EXISTS task_assignments_assigned_by_fkey,
  ADD CONSTRAINT task_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);

-- Update foreign key in invitations table
ALTER TABLE public.invitations 
  DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey,
  ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);

-- Update RLS policies for users table
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.users;

CREATE POLICY "Users can view all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can update users in their organization"
  ON public.users FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Update policy for invitations
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
CREATE POLICY "Admins can manage invitations" ON public.invitations
FOR ALL USING (
  has_role(auth.uid(), 'admin') AND 
  organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
);

-- Update policy for personal_holidays
DROP POLICY IF EXISTS "Allow insert for new users via invitation" ON public.users;
CREATE POLICY "Allow insert for new users via invitation" ON public.users
FOR INSERT WITH CHECK (true);

-- Update has_role function to use users table
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = _user_id
    WHERE ur.user_id = _user_id 
      AND ur.role = _role
      AND ur.organization_id = u.organization_id
  )
$$;

-- Update same_organization function
CREATE OR REPLACE FUNCTION public.same_organization(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u1
    JOIN public.users u2 ON u1.organization_id = u2.organization_id
    WHERE u1.id = auth.uid() AND u2.id = _user_id
  )
$$;

-- Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record record;
  new_org_name text;
  target_org_id uuid;
  target_role app_role;
BEGIN
  -- Check for invitation token in metadata
  IF NEW.raw_user_meta_data->>'invitation_token' IS NOT NULL THEN
    SELECT * INTO invitation_record
    FROM public.invitations
    WHERE token = (NEW.raw_user_meta_data->>'invitation_token')::uuid
      AND status = 'pending'
      AND expires_at > now();
    
    IF invitation_record IS NOT NULL THEN
      target_org_id := invitation_record.organization_id;
      target_role := invitation_record.role;
      
      -- Mark invitation as accepted
      UPDATE public.invitations SET status = 'accepted' WHERE id = invitation_record.id;
    END IF;
  END IF;
  
  -- Check if user wants to create new org
  IF target_org_id IS NULL AND NEW.raw_user_meta_data->>'organization_name' IS NOT NULL THEN
    new_org_name := NEW.raw_user_meta_data->>'organization_name';
    INSERT INTO public.organizations (name) VALUES (new_org_name) RETURNING id INTO target_org_id;
    target_role := 'admin'; -- First user of new org is admin
  END IF;
  
  -- Fallback to default org if no invitation or new org
  IF target_org_id IS NULL THEN
    target_org_id := '00000000-0000-0000-0000-000000000001';
    target_role := 'user'; -- Use 'user' instead of 'employee'
  END IF;
  
  -- Create user with organization_id
  INSERT INTO public.users (id, email, full_name, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    target_org_id
  );
  
  -- Assign role with organization_id
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (NEW.id, target_role, target_org_id);
  
  RETURN NEW;
END;
$$;

-- Update get_subordinates function if it exists
-- Drop the function first if it exists (to handle return type changes)
DROP FUNCTION IF EXISTS public.get_subordinates(uuid);

CREATE FUNCTION public.get_subordinates(_manager_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  department text,
  manager_id uuid,
  level integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    -- Base case: direct subordinates
    SELECT 
      u.id,
      u.full_name,
      u.email,
      u.department,
      u.manager_id,
      1 as level
    FROM public.users u
    WHERE u.manager_id = _manager_id AND u.is_active = true
    
    UNION ALL
    
    -- Recursive case: subordinates of subordinates
    SELECT 
      u.id,
      u.full_name,
      u.email,
      u.department,
      u.manager_id,
      s.level + 1
    FROM public.users u
    INNER JOIN subordinates s ON u.manager_id = s.id
    WHERE u.is_active = true
  )
  SELECT * FROM subordinates;
END;
$$;

-- Update is_manager_of function if it exists
CREATE OR REPLACE FUNCTION public.is_manager_of(_manager_id uuid, _subordinate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.get_subordinates(_manager_id)
    WHERE id = _subordinate_id
  ) INTO result;
  
  RETURN COALESCE(result, false);
END;
$$;

-- ============================================================================
-- PART 3: Update organization_settings RLS policy to use users table
-- ============================================================================

-- Now that users table exists, update the organization_settings policy
DROP POLICY IF EXISTS "Admins can manage organization settings" ON public.organization_settings;

CREATE POLICY "Admins can manage organization settings"
  ON public.organization_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Tables renamed:
--   - system_settings → organization_settings
--   - profiles → users
-- 
-- All foreign keys, RLS policies, and functions have been updated.
-- ============================================================================

