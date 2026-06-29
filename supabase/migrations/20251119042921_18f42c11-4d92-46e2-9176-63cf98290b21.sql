-- Temporarily make profiles and user_roles tables publicly accessible for initial setup
-- This allows creating initial admin accounts without being logged in

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

-- Create temporary public policies for profiles
CREATE POLICY "Temporary: Public can view all profiles"
ON public.profiles
FOR SELECT
USING (true);

CREATE POLICY "Temporary: Public can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Temporary: Public can update profiles"
ON public.profiles
FOR UPDATE
USING (true);

-- Create temporary public policies for user_roles
CREATE POLICY "Temporary: Public can view all roles"
ON public.user_roles
FOR SELECT
USING (true);

CREATE POLICY "Temporary: Public can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Temporary: Public can update roles"
ON public.user_roles
FOR UPDATE
USING (true);

CREATE POLICY "Temporary: Public can delete roles"
ON public.user_roles
FOR DELETE
USING (true);

-- Add is_active column to profiles for account deactivation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add last_login column to track user activity
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;