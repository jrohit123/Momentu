-- Fix RLS policy for organization_settings to allow all users to read settings
-- while only admins can modify them

-- Drop the existing policy that restricts read access to admins only
DROP POLICY IF EXISTS "Admins can manage organization settings" ON public.organization_settings;

-- Create a policy that allows all authenticated users in the same organization to READ settings
CREATE POLICY "Users can view organization settings"
  ON public.organization_settings FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- Create a policy that only allows admins to INSERT/UPDATE/DELETE settings
CREATE POLICY "Admins can manage organization settings"
  ON public.organization_settings FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    AND organization_id IN (
      SELECT organization_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') 
    AND organization_id IN (
      SELECT organization_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

