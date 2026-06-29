-- Add columns to cache Beehiiv stats on email_blasts
ALTER TABLE public.email_blasts 
ADD COLUMN IF NOT EXISTS cached_stats JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stats_cached_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.email_blasts.cached_stats IS 'Cached stats from Beehiiv API (opens, clicks, etc.)';
COMMENT ON COLUMN public.email_blasts.stats_cached_at IS 'When the stats were last fetched from Beehiiv';