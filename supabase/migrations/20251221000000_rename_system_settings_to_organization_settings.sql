-- Rename system_settings table to organization_settings
ALTER TABLE public.system_settings RENAME TO organization_settings;

-- Update RLS policies
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.organization_settings;

CREATE POLICY "Admins can manage organization settings"
  ON public.organization_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

