-- Add 'delayed' status to task_status enum
-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
-- If the value already exists, this will error, which is safe to ignore
DO $$ BEGIN
    ALTER TYPE public.task_status ADD VALUE 'delayed';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

