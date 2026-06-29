-- Remove dangerous public policies that allow unauthenticated access
DROP POLICY IF EXISTS "Public can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Public can update posts" ON public.posts;
DROP POLICY IF EXISTS "Public can view posts" ON public.posts;