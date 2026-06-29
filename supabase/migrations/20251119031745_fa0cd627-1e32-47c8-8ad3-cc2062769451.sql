-- Phase 1: Database Architecture for Two-Tier Authentication System

-- 1. Create role and post type enums
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.post_type AS ENUM ('standard', 'column');
CREATE TYPE public.recurrence_type AS ENUM ('one_time', 'weekly', 'biweekly', 'monthly');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, role)
);

-- 4. Create sites table for WordPress integration
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  wordpress_username text,
  wordpress_app_password text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.profiles(id)
);

-- 5. Create post_assignments table
CREATE TABLE public.post_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_name text NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  post_type public.post_type NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date NOT NULL,
  recurrence_type public.recurrence_type DEFAULT 'one_time' NOT NULL,
  recurrence_day_of_week integer,
  recurrence_end_date date,
  is_completed boolean DEFAULT false NOT NULL,
  completed_at timestamptz,
  submitted_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.profiles(id)
);

-- 6. Add indexes for performance
CREATE INDEX idx_assignments_due_date ON public.post_assignments(due_date);
CREATE INDEX idx_assignments_assigned_to ON public.post_assignments(assigned_to);
CREATE INDEX idx_assignments_site_id ON public.post_assignments(site_id);
CREATE INDEX idx_assignments_completed ON public.post_assignments(is_completed);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- 7. Update posts table with client tracking
ALTER TABLE public.posts
  ADD COLUMN client_id uuid REFERENCES public.profiles(id),
  ADD COLUMN assignment_ids uuid[] DEFAULT '{}';

-- 8. Create security definer function to check roles
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 9. Auto-create profile on signup
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_assignments ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 12. RLS Policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 13. RLS Policies for sites
CREATE POLICY "Admins can manage sites"
  ON public.sites FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view active sites"
  ON public.sites FOR SELECT
  USING (
    is_active = true AND 
    public.has_role(auth.uid(), 'client')
  );

-- 14. RLS Policies for post_assignments
CREATE POLICY "Admins can manage all assignments"
  ON public.post_assignments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their assignments"
  ON public.post_assignments FOR SELECT
  USING (
    assigned_to = auth.uid() AND
    public.has_role(auth.uid(), 'client')
  );

CREATE POLICY "Clients can update assignment status"
  ON public.post_assignments FOR UPDATE
  USING (
    assigned_to = auth.uid() AND
    public.has_role(auth.uid(), 'client')
  )
  WITH CHECK (
    assigned_to = auth.uid() AND
    public.has_role(auth.uid(), 'client')
  );

-- 15. Update RLS policies for posts table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.posts;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.posts;

CREATE POLICY "Admins can manage all posts"
  ON public.posts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can create posts"
  ON public.posts FOR INSERT
  WITH CHECK (
    client_id = auth.uid() AND
    public.has_role(auth.uid(), 'client')
  );

CREATE POLICY "Clients can view own posts"
  ON public.posts FOR SELECT
  USING (
    client_id = auth.uid() AND
    public.has_role(auth.uid(), 'client')
  );

CREATE POLICY "Clients can update own posts"
  ON public.posts FOR UPDATE
  USING (
    client_id = auth.uid() AND
    public.has_role(auth.uid(), 'client')
  );

-- 16. Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 17. Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.post_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();