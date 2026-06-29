-- Trigger immediate push when a new outbox row is inserted with status pending.
CREATE OR REPLACE FUNCTION public.notify_crm_outbox_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  v_url := 'https://nsqosbysixcjcwkdpajk.supabase.co/functions/v1/crm-hubspot-push';
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcW9zYnlzaXhjamN3a2RwYWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MTM3MjQsImV4cCI6MjA3OTA4OTcyNH0.IYTccfE9W7ohrR6zlCOZKTOKW9AkeQHr43-xw2UfdPQ';

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Don't fail the insert if the HTTP call fails; cron sweep will pick it up.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_outbox_push ON public.crm_sync_outbox;
CREATE TRIGGER trg_crm_outbox_push
AFTER INSERT ON public.crm_sync_outbox
FOR EACH ROW
EXECUTE FUNCTION public.notify_crm_outbox_push();