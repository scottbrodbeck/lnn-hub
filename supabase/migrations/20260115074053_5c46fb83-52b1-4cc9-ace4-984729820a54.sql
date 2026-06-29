ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS default_organization_name,
DROP COLUMN IF EXISTS default_logo_author_name;