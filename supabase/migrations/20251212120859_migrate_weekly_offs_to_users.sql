-- Migrate organization weekly offs to user weekly offs
-- This ensures backward compatibility - each user gets the organization's weekly offs
INSERT INTO public.user_weekly_offs (user_id, day_of_week)
SELECT DISTINCT p.id, wo.day_of_week
FROM public.profiles p
CROSS JOIN public.weekly_offs wo
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_weekly_offs uwo
  WHERE uwo.user_id = p.id AND uwo.day_of_week = wo.day_of_week
)
ON CONFLICT (user_id, day_of_week) DO NOTHING;

