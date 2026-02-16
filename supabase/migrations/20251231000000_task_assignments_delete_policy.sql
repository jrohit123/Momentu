-- Allow users to delete task assignments when they created the assignment or are assigned to the same task
-- (so they can remove themselves or others from the task from the assign dialog)
CREATE POLICY "Users can delete task assignments they created or on same task"
  ON public.task_assignments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = assigned_by
    OR EXISTS (
      SELECT 1 FROM public.task_assignments t2
      WHERE t2.task_id = task_assignments.task_id
      AND t2.assigned_to = auth.uid()
    )
  );
