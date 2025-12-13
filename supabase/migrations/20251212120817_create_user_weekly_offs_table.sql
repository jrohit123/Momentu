-- Create user_weekly_offs table for individual weekly offs
CREATE TABLE IF NOT EXISTS public.user_weekly_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  day_of_week day_of_week NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.user_weekly_offs ENABLE ROW LEVEL SECURITY;

-- Create function to get all subordinates (direct and indirect)
CREATE OR REPLACE FUNCTION public.get_subordinates(_user_id UUID)
RETURNS TABLE(subordinate_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    -- Direct reports
    SELECT id
    FROM public.profiles
    WHERE manager_id = _user_id
    
    UNION
    
    -- Indirect reports (recursive)
    SELECT p.id
    FROM public.profiles p
    INNER JOIN subordinates s ON p.manager_id = s.subordinate_id
  )
  SELECT subordinate_id FROM subordinates;
END;
$$;

-- Create function to check if a user is a manager of another user
CREATE OR REPLACE FUNCTION public.is_manager_of(_manager_id UUID, _subordinate_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if direct manager
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = _subordinate_id AND manager_id = _manager_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if indirect manager (through get_subordinates)
  IF EXISTS (
    SELECT 1 FROM public.get_subordinates(_manager_id) 
    WHERE subordinate_id = _subordinate_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- RLS Policies for user_weekly_offs

-- Users can view their own weekly offs
CREATE POLICY "Users can view own weekly offs"
  ON public.user_weekly_offs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Managers can view their subordinates' weekly offs
CREATE POLICY "Managers can view subordinates' weekly offs"
  ON public.user_weekly_offs FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR 
    public.is_manager_of(auth.uid(), user_id)
  );

-- Admins can view all weekly offs
CREATE POLICY "Admins can view all weekly offs"
  ON public.user_weekly_offs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can manage their own weekly offs
CREATE POLICY "Users can manage own weekly offs"
  ON public.user_weekly_offs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage all weekly offs
CREATE POLICY "Admins can manage all weekly offs"
  ON public.user_weekly_offs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

