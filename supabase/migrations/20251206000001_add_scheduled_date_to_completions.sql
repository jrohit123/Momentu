-- Add scheduled_date column to task_completions table
-- This tracks when the task was supposed to be completed (for recurring tasks)
ALTER TABLE public.task_completions 
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Add comment to explain the column
COMMENT ON COLUMN public.task_completions.scheduled_date IS 'The date when the task was originally scheduled to be completed. For recurring tasks, this differs from completion_date when the task is delayed.';

-- Update existing records: set scheduled_date = completion_date for backward compatibility
UPDATE public.task_completions 
SET scheduled_date = completion_date::DATE 
WHERE scheduled_date IS NULL;

-- Make scheduled_date NOT NULL after setting defaults
ALTER TABLE public.task_completions 
ALTER COLUMN scheduled_date SET NOT NULL;

-- Drop existing unique constraint if it exists
-- The original migration had UNIQUE (assignment_id, completion_date) as inline constraint
-- PostgreSQL may have auto-named it, so we try common names
DO $$ 
DECLARE
    constraint_name text;
BEGIN
    -- Find the constraint name
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.task_completions'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 2;
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.task_completions DROP CONSTRAINT %I', constraint_name);
    END IF;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

-- Add new unique constraint with scheduled_date
-- This ensures one completion record per assignment per scheduled date
ALTER TABLE public.task_completions 
ADD CONSTRAINT task_completions_assignment_id_scheduled_date_key 
UNIQUE (assignment_id, scheduled_date);

