-- =============================================
-- FIX 1: user_roles - Remove all public policies, add proper access control
-- =============================================

-- Drop dangerous temporary policies
DROP POLICY IF EXISTS "Temporary: Public can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Temporary: Public can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Temporary: Public can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Temporary: Public can delete roles" ON public.user_roles;

-- Users can view their own role (needed for app to determine user type)
CREATE POLICY "Users can view own role" ON public.user_roles
FOR SELECT USING (auth.uid() = user_id);

-- Admins can manage all roles
CREATE POLICY "Admins can manage all roles" ON public.user_roles
FOR ALL USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- FIX 2: debug_paste_logs - Restrict access appropriately
-- =============================================

-- Drop public policies
DROP POLICY IF EXISTS "Anyone can view debug logs" ON public.debug_paste_logs;
DROP POLICY IF EXISTS "Anyone can insert debug logs" ON public.debug_paste_logs;

-- Only admins can view debug logs
CREATE POLICY "Admins can view debug logs" ON public.debug_paste_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Authenticated users can insert debug logs (for debugging purposes)
CREATE POLICY "Authenticated users can insert debug logs" ON public.debug_paste_logs
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- FIX 3: image_uploads - Restrict to authenticated users only
-- =============================================

-- Drop public policies
DROP POLICY IF EXISTS "Public can insert images" ON public.image_uploads;
DROP POLICY IF EXISTS "Public can update image captions" ON public.image_uploads;
DROP POLICY IF EXISTS "Public can delete images" ON public.image_uploads;
DROP POLICY IF EXISTS "Public can view images" ON public.image_uploads;

-- Authenticated users can view images (needed for media library)
CREATE POLICY "Authenticated users can view images" ON public.image_uploads
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Authenticated users can insert images
CREATE POLICY "Authenticated users can insert images" ON public.image_uploads
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Authenticated users can update images (captions, etc.)
CREATE POLICY "Authenticated users can update images" ON public.image_uploads
FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Authenticated users can delete images
CREATE POLICY "Authenticated users can delete images" ON public.image_uploads
FOR DELETE USING (auth.uid() IS NOT NULL);