-- Create column_templates table
CREATE TABLE public.column_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  author_name TEXT,
  banner_image_url TEXT,
  intro_paragraph TEXT,
  featured_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.column_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all templates"
ON public.column_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view active templates for their organization"
ON public.column_templates
FOR SELECT
USING (
  is_active = true 
  AND has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_column_templates_updated_at
BEFORE UPDATE ON public.column_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_column_templates_organization_id ON public.column_templates(organization_id);
CREATE INDEX idx_column_templates_is_active ON public.column_templates(is_active);