-- Update RLS policy to show scheduled posts that have reached their publish time
DROP POLICY IF EXISTS "Anyone can view published posts" ON public.blog_posts;

CREATE POLICY "Anyone can view published posts" 
ON public.blog_posts 
FOR SELECT 
USING (
  status = 'published'::text 
  OR (status = 'scheduled'::text AND published_at IS NOT NULL AND published_at <= now())
);