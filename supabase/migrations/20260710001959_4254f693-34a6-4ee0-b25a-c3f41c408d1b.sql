-- Schedule hourly refresh of purchase alerts via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: unschedule if it already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'regenerate-compras-alerts-hourly') THEN
    PERFORM cron.unschedule('regenerate-compras-alerts-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'regenerate-compras-alerts-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--e40d4a9c-4930-4ed0-b9a2-854b51d12f79.lovable.app/api/public/hooks/regenerate-compras-alerts',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHV1a3R0bmFzdWlkd3pzaWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NzAzODgsImV4cCI6MjA5NTI0NjM4OH0.nBpAPd5wFra1VC01Bmf3xO7Nn8GjLQbgg5WBTqozsFg"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);