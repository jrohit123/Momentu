-- Drop the policy that allows users to manage their own weekly offs
DROP POLICY IF EXISTS "Users can manage own weekly offs" ON public.user_weekly_offs;

-- Add policy for managers to manage their subordinates' weekly offs
CREATE POLICY "Managers can manage subordinates' weekly offs"
  ON public.user_weekly_offs FOR ALL
  TO authenticated
  USING (
    public.is_manager_of(auth.uid(), user_id)
  )
  WITH CHECK (
    public.is_manager_of(auth.uid(), user_id)
  );

