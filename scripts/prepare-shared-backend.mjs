import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "supabase", "upstream");
const files = (await readdir(sourceDirectory))
  .filter((file) => /^\d{14}_.+\.sql$/.test(file))
  .sort();
if (files.length !== 11)
  throw new Error("Expected all 11 upstream migrations, including security and RPC grants");
const parts = [];
for (const file of files) {
  let source = await readFile(path.join(sourceDirectory, file), "utf8");
  if (file.endsWith("_storage.sql")) {
    // Avatars ship with the app. No public Storage buckets are needed.
    source =
      "INSERT INTO nuvio_migrations.schema_migrations (version) VALUES ('00000000000002') ON CONFLICT DO NOTHING;";
  }
  if (file.endsWith("_clean_account_restore.sql")) {
    // Hosted roles cannot attach this custom parameter to a function. Backup
    // import is outside this app's scope and its RPC is revoked below.
    const setting =
      /ALTER FUNCTION public\.sync_restore_account_backup\(jsonb, text\)\s+SET nuvio\.skip_profile_defaults = 'on';/;
    if (!setting.test(source)) throw new Error("Review upstream backup restore adaptation");
    source = source.replace(setting, "-- Account backup import is disabled on the shared backend.");
  }
  if (file.endsWith("_baseline.sql")) {
    const monitorRole =
      /DO \$\$\s*BEGIN\s*IF NOT EXISTS \([\s\S]*?rolname = 'supabase_monitor'[\s\S]*?END;\s*\$\$;/;
    if (!monitorRole.test(source))
      throw new Error("Upstream baseline changed: review the monitor role adaptation");
    source = source.replace(
      monitorRole,
      "-- Hosted Supabase owns monitoring roles; no custom monitor is created."
    );
    source = source.replace(/^GRANT .* TO supabase_monitor;\r?\n/gm, "");
    source = source.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin .*;\r?\n/gm, "");
  }
  // One transaction prevents exposing intermediate, broader upstream grants.
  source = source.replace(/^BEGIN;\r?\n/gm, "").replace(/^COMMIT;\r?$/gm, "");
  parts.push(`-- Source: ${file}\n${source.trim()}\n`);
}
const header = `-- Nuvio shared backend, adapted for hosted Supabase.
-- Upstream: NuvioMedia/self-host@39ea2bd1bc71636127f9d797599c23b4236960c4
-- Execute once on a NEW, EMPTY project. No account data is imported.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL OR to_regclass('public.library_items') IS NOT NULL THEN
    RAISE EXCEPTION 'Nuvio tables already exist. Use a new empty project; this script is for initial setup only.';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
`;
const footer = `
-- Hosted project objects belong to the applying role, not supabase_admin.
-- All API-exposed tables require RLS, including internal tables with no policy.
DO $$
DECLARE target record;
BEGIN
  FOR target IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schemaname, target.tablename);
  END LOOP;
END;
$$;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
const hardening = await readFile(path.join(root, "supabase", "hosted-hardening.sql"), "utf8");
const sql = header + parts.join("\n") + hardening + footer;
if (
  /CREATE ROLE supabase_monitor|ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin|GRANT .* TO supabase_monitor/.test(
    sql
  )
) {
  throw new Error("Hosted adaptation left unsupported role changes");
}
const output = path.join(root, "supabase", "bootstrap.sql");
await writeFile(output, sql, "utf8");
console.log(`Shared Supabase SQL prepared from ${files.length} pinned migrations: ${output}`);
