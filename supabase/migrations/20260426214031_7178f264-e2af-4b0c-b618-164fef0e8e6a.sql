-- Schedule HubSpot sync dispatcher every 2 minutes
SELECT cron.schedule(
  'crm-hubspot-sync-tick',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nsqosbysixcjcwkdpajk.supabase.co/functions/v1/crm-hubspot-sync-tick',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcW9zYnlzaXhjamN3a2RwYWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MTM3MjQsImV4cCI6MjA3OTA4OTcyNH0.IYTccfE9W7ohrR6zlCOZKTOKW9AkeQHr43-xw2UfdPQ"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);