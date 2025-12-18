-- Fix handle_new_user function to include organization_id support
-- This migration fixes the issue where the function was overwritten without organization support
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
  
  -- Create profile with organization_id
  INSERT INTO public.profiles (id, email, full_name, organization_id)
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


