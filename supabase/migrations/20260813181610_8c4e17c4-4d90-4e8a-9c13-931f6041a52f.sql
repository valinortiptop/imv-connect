CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('netsuite-sync-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('netsuite-sync-inventario-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'netsuite-sync-nightly',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--e40d4a9c-4930-4ed0-b9a2-854b51d12f79.lovable.app/api/public/hooks/netsuite-sync',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHV1a3R0bmFzdWlkd3pzaWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NzAzODgsImV4cCI6MjA5NTI0NjM4OH0.nBpAPd5wFra1VC01Bmf3xO7Nn8GjLQbgg5WBTqozsFg"}'::jsonb,
    body := '{"entities": ["clientes", "productos", "ventas", "inventario"], "days": 2}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'netsuite-sync-inventario-hourly',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--e40d4a9c-4930-4ed0-b9a2-854b51d12f79.lovable.app/api/public/hooks/netsuite-sync',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHV1a3R0bmFzdWlkd3pzaWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NzAzODgsImV4cCI6MjA5NTI0NjM4OH0.nBpAPd5wFra1VC01Bmf3xO7Nn8GjLQbgg5WBTqozsFg"}'::jsonb,
    body := '{"entities": ["inventario"]}'::jsonb
  );
  $$
);