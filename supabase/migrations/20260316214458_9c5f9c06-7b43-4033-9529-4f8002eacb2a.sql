
-- Add updated_at column to display_ad_placements
ALTER TABLE public.display_ad_placements 
ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Create auto-update trigger for display_ad_placements
CREATE TRIGGER update_display_ad_placements_updated_at
  BEFORE UPDATE ON public.display_ad_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
