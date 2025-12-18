-- Create task_dependencies table
CREATE TABLE public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  depends_on_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent self-dependencies
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
  -- Prevent duplicate dependencies
  UNIQUE (task_id, depends_on_task_id)
);

-- Create index for faster lookups
CREATE INDEX idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);

-- Enable RLS
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view dependencies for tasks they created or are assigned to
CREATE POLICY "Users can view task dependencies"
  ON public.task_dependencies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_dependencies.task_id
      AND (t.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.task_assignments ta
        WHERE ta.task_id = t.id AND ta.assigned_to = auth.uid()
      ))
    )
  );

-- Users can create dependencies for tasks they created
CREATE POLICY "Users can create task dependencies"
  ON public.task_dependencies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_dependencies.task_id
      AND t.created_by = auth.uid()
    )
  );

-- Users can delete dependencies for tasks they created
CREATE POLICY "Users can delete task dependencies"
  ON public.task_dependencies FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_dependencies.task_id
      AND t.created_by = auth.uid()
    )
  );

-- Function to check for circular dependencies
CREATE OR REPLACE FUNCTION public.check_circular_dependency(
  p_task_id UUID,
  p_depends_on_task_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visited UUID[] := ARRAY[]::UUID[];
  v_current UUID;
  v_queue UUID[] := ARRAY[p_depends_on_task_id]::UUID[];
BEGIN
  -- If task depends on itself, it's circular
  IF p_task_id = p_depends_on_task_id THEN
    RETURN true;
  END IF;

  -- BFS to check if p_depends_on_task_id depends on p_task_id (directly or indirectly)
  WHILE array_length(v_queue, 1) > 0 LOOP
    v_current := v_queue[1];
    v_queue := v_queue[2:array_length(v_queue, 1)];
    
    -- If we've already visited this node, skip
    IF v_current = ANY(v_visited) THEN
      CONTINUE;
    END IF;
    
    -- Mark as visited
    v_visited := array_append(v_visited, v_current);
    
    -- If current task is the original task, we have a cycle
    IF v_current = p_task_id THEN
      RETURN true;
    END IF;
    
    -- Add all tasks that v_current depends on to the queue
    SELECT array_agg(depends_on_task_id) INTO v_queue
    FROM public.task_dependencies
    WHERE task_id = v_current
    AND depends_on_task_id != ALL(v_visited);
    
    IF v_queue IS NOT NULL AND array_length(v_queue, 1) > 0 THEN
      v_queue := array_cat(
        (SELECT array_agg(elem) FROM unnest(v_queue) AS elem WHERE elem != ALL(v_visited)),
        ARRAY[]::UUID[]
      );
    ELSE
      v_queue := ARRAY[]::UUID[];
    END IF;
  END LOOP;
  
  RETURN false;
END;
$$;

-- Trigger to prevent circular dependencies
CREATE OR REPLACE FUNCTION public.prevent_circular_dependency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.check_circular_dependency(NEW.task_id, NEW.depends_on_task_id) THEN
    RAISE EXCEPTION 'Circular dependency detected: Task cannot depend on a task that depends on it (directly or indirectly)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_circular_dependency_trigger
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_circular_dependency();

