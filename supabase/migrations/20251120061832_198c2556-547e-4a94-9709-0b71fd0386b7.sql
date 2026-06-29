-- Add persistent logo and organization name columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN default_logo_url text,
ADD COLUMN default_organization_name text;

COMMENT ON COLUMN public.profiles.default_logo_url IS 'Default logo URL that persists across post submissions';
COMMENT ON COLUMN public.profiles.default_organization_name IS 'Default organization/author name that persists across post submissions';