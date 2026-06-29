-- Add unique constraint for cache upsert functionality
ALTER TABLE public.display_ad_cache 
ADD CONSTRAINT display_ad_cache_org_key_unique UNIQUE (organization_id, cache_key);