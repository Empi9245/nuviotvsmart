-- Read-only invariant checks. A failed assertion aborts this verification.
DO $$
BEGIN
  IF (SELECT count(*) FROM nuvio_migrations.schema_migrations) <> 11 THEN
    RAISE EXCEPTION 'Expected all eleven pinned source migrations';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Public table without RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND (p.prosecdef OR p.proname NOT IN ('health_ping','get_avatar_catalog'))) THEN
    RAISE EXCEPTION 'Unexpected anonymous RPC access';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND (
      has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') OR
      has_table_privilege('authenticated',c.oid,'TRUNCATE') OR
      (c.relname <> 'avatar_catalog' AND has_table_privilege('anon',c.oid,'SELECT')))) THEN
    RAISE EXCEPTION 'Unexpected table privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proconfig IS NULL) THEN
    RAISE EXCEPTION 'Privileged function without a bound search path';
  END IF;
  IF EXISTS (SELECT required.name FROM unnest(ARRAY[
    'sync_pull_profiles','sync_push_profiles','sync_push_addons','sync_pull_library',
    'sync_push_library_items','sync_pull_watch_progress','sync_push_watch_progress',
    'sync_get_library_delta_cursor','sync_pull_library_delta',
    'register_current_device','list_my_sessions'
  ]) required(name) WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=required.name
      AND has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
    RAISE EXCEPTION 'Required authenticated RPC missing';
  END IF;
END;
$$;
SELECT jsonb_build_object('status','PASS',
  'public_tables', (SELECT count(*) FROM pg_tables WHERE schemaname='public'),
  'source_migrations', (SELECT count(*) FROM nuvio_migrations.schema_migrations),
  'anonymous_rpcs', (SELECT jsonb_agg(p.proname ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE')));
