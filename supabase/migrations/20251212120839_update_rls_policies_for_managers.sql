-- Drop existing policies for task_assignments and task_completions
DROP POLICY IF EXISTS "Users can view own task assignments" ON public.task_assignments;
DROP POLICY IF EXISTS "Users can view assigned tasks" ON public.task_assignments;
DROP POLICY IF EXISTS "Users can create task assignments" ON public.task_assignments;
DROP POLICY IF EXISTS "Users can update own task assignments" ON public.task_assignments;
DROP POLICY IF EXISTS "Admins can manage all task assignments" ON public.task_assignments;

DROP POLICY IF EXISTS "Users can view own task completions" ON public.task_completions;
DROP POLICY IF EXISTS "Users can create task completions" ON public.task_completions;
DROP POLICY IF EXISTS "Users can update own task completions" ON public.task_completions;
DROP POLICY IF EXISTS "Admins can manage all task completions" ON public.task_completions;

-- New RLS Policies for task_assignments

-- Users can view their own assignments
CREATE POLICY "Users can view own task assignments"
  ON public.task_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = assigned_to);

-- Managers can view their subordinates' assignments
CREATE POLICY "Managers can view subordinates' task assignments"
  ON public.task_assignments FOR SELECT
  TO authenticated
  USING (public.is_manager_of(auth.uid(), assigned_to));

-- Admins can view all assignments
CREATE POLICY "Admins can view all task assignments"
  ON public.task_assignments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can create assignments (when assigned to them)
CREATE POLICY "Users can create task assignments"
  ON public.task_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = assigned_to OR public.has_role(auth.uid(), 'admin'));

-- Users can update their own assignments
CREATE POLICY "Users can update own task assignments"
  ON public.task_assignments FOR UPDATE
  TO authenticated
  USING (auth.uid() = assigned_to)
  WITH CHECK (auth.uid() = assigned_to);

-- Admins can manage all assignments
CREATE POLICY "Admins can manage all task assignments"
  ON public.task_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- New RLS Policies for task_completions

-- Users can view their own completions
CREATE POLICY "Users can view own task completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_completions.assignment_id
      AND ta.assigned_to = auth.uid()
    )
  );

-- Managers can view their subordinates' completions
CREATE POLICY "Managers can view subordinates' task completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_completions.assignment_id
      AND public.is_manager_of(auth.uid(), ta.assigned_to)
    )
  );

-- Admins can view all completions
CREATE POLICY "Admins can view all task completions"
  ON public.task_completions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can create completions for their own assignments
CREATE POLICY "Users can create task completions"
  ON public.task_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_completions.assignment_id
      AND ta.assigned_to = auth.uid()
    )
  );

-- Users can update their own completions
CREATE POLICY "Users can update own task completions"
  ON public.task_completions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_completions.assignment_id
      AND ta.assigned_to = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_completions.assignment_id
      AND ta.assigned_to = auth.uid()
    )
  );

-- Admins can manage all completions
CREATE POLICY "Admins can manage all task completions"
  ON public.task_completions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

