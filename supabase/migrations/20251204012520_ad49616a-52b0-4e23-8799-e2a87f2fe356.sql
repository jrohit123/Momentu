-- Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Add organization_id to profiles
ALTER TABLE public.profiles ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Add organization_id to user_roles
ALTER TABLE public.user_roles ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Create a default organization
INSERT INTO public.organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization');

-- Update existing profiles to belong to default org
UPDATE public.profiles SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- Update existing user_roles to belong to default org
UPDATE public.user_roles SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- Make organization_id NOT NULL after setting defaults
ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN organization_id SET NOT NULL;

-- Update has_role function to be org-aware
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = _user_id
    WHERE ur.user_id = _user_id 
      AND ur.role = _role
      AND ur.organization_id = p.organization_id
  )
$$;

-- Create function to check if user is in same org
CREATE OR REPLACE FUNCTION public.same_organization(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p1
    JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
    WHERE p1.id = auth.uid() AND p2.id = _user_id
  )
$$;

-- RLS for organizations
CREATE POLICY "Users can view own organization"
ON public.organizations FOR SELECT
USING (id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can update own organization"
ON public.organizations FOR UPDATE
USING (has_role(auth.uid(), 'admin') AND id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Update user_roles policies to be org-aware
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view roles in own org"
ON public.user_roles FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage roles in own org"
ON public.user_roles FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

-- Update handle_new_user to assign to default org and make first user admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  default_org_id uuid := '00000000-0000-0000-0000-000000000001';
  user_count int;
BEGIN
  -- Count existing users in default org
  SELECT COUNT(*) INTO user_count FROM public.profiles WHERE organization_id = default_org_id;
  
  INSERT INTO public.profiles (id, email, full_name, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    default_org_id
  );
  
  -- First user becomes admin, others get employee role
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.id, 'admin', default_org_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.id, 'employee', default_org_id);
  END IF;
  
  RETURN NEW;
END;
$$;