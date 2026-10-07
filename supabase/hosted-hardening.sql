-- Hosted adaptations applied after the pinned upstream migrations, in the
-- same transaction. The upstream RPCs derive ownership from the caller's JWT.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS profiles_avatar_id_idx ON public.profiles (avatar_id);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.avatar_catalog TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.avatar_catalog FROM authenticated;
REVOKE ALL ON public.library_item_events, public.watch_progress_events,
  public.watched_item_events, public.sync_push_audit_logs,
  public.user_activity_events, public.tv_login_sessions FROM authenticated;
GRANT SELECT ON public.user_session_devices TO authenticated;
ALTER TABLE nuvio_private.instance_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA nuvio_private, nuvio_migrations FROM anon, authenticated;

-- Account QR login belongs to the original server and is unused in this app.
REVOKE EXECUTE ON FUNCTION public.start_tv_login_session(text, text, text),
  public.poll_tv_login_session(text, text), public.approve_tv_login_session(text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_restore_account_backup(jsonb, text),
  public.sync_export_account_backup() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.get_avatar_catalog() SECURITY INVOKER;
ALTER FUNCTION public.health_ping() SECURITY INVOKER;
ALTER FUNCTION public.can_access_user_data(uuid) SECURITY INVOKER;

-- Bound paths for all routines, including non-definer trigger helpers.
DO $$
DECLARE routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE 'ALTER FUNCTION ' || routine.signature ||
      ' SET search_path = pg_catalog, public, auth, extensions, pg_temp';
  END LOOP;
END;
$$;

-- Make the owner predicate explicit and evaluate the JWT once per statement.
-- Separate operations preserve SELECT access needed for UPDATE.
DO $$
DECLARE target record; rule record;
BEGIN
  FOR target IN
    SELECT c.oid, c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = ANY (ARRAY['addons', 'collections', 'library_items',
        'plugins', 'profile_settings_blobs', 'profiles', 'home_catalog_settings',
        'profile_tracker_settings', 'user_tracker_tokens', 'watched_items',
        'watch_progress', 'user_session_devices'])
  LOOP
    FOR rule IN SELECT polname FROM pg_policy WHERE polrelid = target.oid
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', rule.polname, target.relname);
    END LOOP;
    EXECUTE format('CREATE POLICY owner_select ON public.%I FOR SELECT TO authenticated USING (user_id = (select auth.uid()))', target.relname);
    IF target.relname <> 'user_session_devices' THEN
      EXECUTE format('CREATE POLICY owner_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()))', target.relname);
      EXECUTE format('CREATE POLICY owner_update ON public.%I FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))', target.relname);
      EXECUTE format('CREATE POLICY owner_delete ON public.%I FOR DELETE TO authenticated USING (user_id = (select auth.uid()))', target.relname);
    END IF;
  END LOOP;
END;
$$;
DROP POLICY tracker_sessions_owner_read ON public.tracker_tv_login_sessions;
CREATE POLICY tracker_sessions_owner_read ON public.tracker_tv_login_sessions
  FOR SELECT TO authenticated USING (owner_user_id = (select auth.uid()));
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
