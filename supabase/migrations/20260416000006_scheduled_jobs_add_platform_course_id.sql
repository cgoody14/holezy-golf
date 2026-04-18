ALTER TABLE public.scheduled_jobs
  ADD COLUMN IF NOT EXISTS platform_course_id TEXT;
