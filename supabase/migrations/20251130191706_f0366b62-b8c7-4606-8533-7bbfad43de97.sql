-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('employee', 'manager', 'admin');

-- Create enum for task status
CREATE TYPE public.task_status AS ENUM ('completed', 'partial', 'not_done', 'pending', 'not_applicable', 'scheduled');

-- Create enum for day of week
CREATE TYPE public.day_of_week AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- Create profiles table with user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  department TEXT,
  manager_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create weekly_offs table (organization-wide)
CREATE TABLE public.weekly_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week day_of_week NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create public_holidays table
CREATE TABLE public.public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_name TEXT NOT NULL,
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create personal_holidays table
CREATE TABLE public.personal_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly', 'custom')),
  recurrence_config JSONB, -- Store custom recurrence rules
  benchmark NUMERIC,
  category TEXT,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Create task_assignments table
CREATE TABLE public.task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) NOT NULL,
  delegation_type TEXT CHECK (delegation_type IN ('self', 'downward', 'peer', 'upward')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, assigned_to)
);

-- Create task_completions table
CREATE TABLE public.task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.task_assignments(id) ON DELETE CASCADE NOT NULL,
  completion_date DATE NOT NULL,
  status task_status NOT NULL,
  quantity_completed NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, completion_date)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for weekly_offs
CREATE POLICY "Everyone can view weekly offs"
  ON public.weekly_offs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage weekly offs"
  ON public.weekly_offs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for public_holidays
CREATE POLICY "Everyone can view public holidays"
  ON public.public_holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage public holidays"
  ON public.public_holidays FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for personal_holidays
CREATE POLICY "Users can view own personal holidays"
  ON public.personal_holidays FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view team personal holidays"
  ON public.personal_holidays FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = personal_holidays.user_id
      AND manager_id = auth.uid()
    )
  );

CREATE POLICY "Users can create personal holidays"
  ON public.personal_holidays FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update pending personal holidays"
  ON public.personal_holidays FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND approval_status = 'pending');

CREATE POLICY "Managers can approve team personal holidays"
  ON public.personal_holidays FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = personal_holidays.user_id
      AND manager_id = auth.uid()
    )
  );

-- RLS Policies for tasks
CREATE POLICY "Users can view own tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE task_id = tasks.id AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "Users can create tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Task creators can update own tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- RLS Policies for task_assignments
CREATE POLICY "Users can view own assignments"
  ON public.task_assignments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = assigned_to OR
    auth.uid() = assigned_by
  );

CREATE POLICY "Managers can view team assignments"
  ON public.task_assignments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = task_assignments.assigned_to
      AND manager_id = auth.uid()
    )
  );

CREATE POLICY "Users can create assignments"
  ON public.task_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = assigned_by);

-- RLS Policies for task_completions
CREATE POLICY "Users can view own completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE id = task_completions.assignment_id
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "Managers can view team completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') AND
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.profiles p ON ta.assigned_to = p.id
      WHERE ta.id = task_completions.assignment_id
      AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own completions"
  ON public.task_completions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE id = task_completions.assignment_id
      AND assigned_to = auth.uid()
    )
  );

-- Create trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Give employee role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_personal_holidays_updated_at
  BEFORE UPDATE ON public.personal_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_completions_updated_at
  BEFORE UPDATE ON public.task_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();