-- Create invitations table
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  role app_role NOT NULL DEFAULT 'employee',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations in their org
CREATE POLICY "Admins can manage invitations" ON public.invitations
FOR ALL USING (
  has_role(auth.uid(), 'admin') AND 
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- Anyone can view invitation by token (for accepting)
CREATE POLICY "Anyone can view invitation by token" ON public.invitations
FOR SELECT USING (true);

-- Allow INSERT for profiles (for signup with invitation)
CREATE POLICY "Allow insert for new users via invitation" ON public.profiles
FOR INSERT WITH CHECK (true);

-- Allow INSERT for organizations (for new org creation)
CREATE POLICY "Allow insert for new organizations" ON public.organizations
FOR INSERT WITH CHECK (true);

-- Update handle_new_user to support invitations and new orgs
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
    target_role := 'employee';
  END IF;
  
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    target_org_id
  );
  
  -- Assign role
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (NEW.id, target_role, target_org_id);
  
  RETURN NEW;
END;
$$;