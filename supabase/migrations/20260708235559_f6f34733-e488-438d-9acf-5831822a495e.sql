
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('v','m')
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', r.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', r.relname);
  END LOOP;
END $$;
