-- Remove dangerous public policies on profiles table
DROP POLICY IF EXISTS "Temporary: Public can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Temporary: Public can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Temporary: Public can update profiles" ON public.profiles;

-- Add proper RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" ON public.profiles
FOR UPDATE USING (has_role(auth.uid(), 'admin'));