-- Assign admin role to existing user if they don't have one
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE p.email = 'scott@arlnow.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
  );

-- Ensure the user is active
UPDATE public.profiles
SET is_active = true
WHERE email = 'scott@arlnow.com';

-- Create a function to automatically assign a default role when a user is created
CREATE OR REPLACE FUNCTION public.ensure_user_has_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user already has a role
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    -- If no role exists, we'll let the application handle it
    -- This prevents auto-assignment but ensures we can detect missing roles
    RAISE NOTICE 'User % created without role', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to run after user profile is created
DROP TRIGGER IF EXISTS check_user_role_on_profile_create ON public.profiles;
CREATE TRIGGER check_user_role_on_profile_create
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_has_role();