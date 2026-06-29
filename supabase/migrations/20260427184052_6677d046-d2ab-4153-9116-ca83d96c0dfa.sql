-- Pause sync as a defensive measure during the wipe.
INSERT INTO public.crm_settings (key, value, updated_at)
VALUES ('sync_paused', 'true'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Clear pending outbox rows for these entities so nothing gets pushed back to HubSpot.
DELETE FROM public.crm_sync_outbox
 WHERE entity_type IN ('contact','company','deal','activity','engagement')
   AND status IN ('pending','in_flight','error');

-- Wipe local mirrors. Order respects soft references (activities/deal_products first).
DELETE FROM public.crm_deal_products;
DELETE FROM public.crm_deal_stage_history;
DELETE FROM public.crm_activities;
DELETE FROM public.crm_deals;
DELETE FROM public.crm_contacts;
DELETE FROM public.crm_organizations;

-- Reset watermarks so the next sync run does a full pull from HubSpot.
UPDATE public.crm_sync_state
   SET last_modified_watermark = NULL,
       last_run_status = NULL,
       last_error = NULL,
       records_processed = 0,
       updated_at = now()
 WHERE object_type IN ('companies','contacts','deals','owners',
                       'engagements_emails','engagements_notes',
                       'engagements_calls','engagements_meetings',
                       'engagements_tasks');

-- Resume sync.
UPDATE public.crm_settings
   SET value = 'false'::jsonb, updated_at = now()
 WHERE key = 'sync_paused';