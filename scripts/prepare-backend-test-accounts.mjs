// Generate disposable, individually confirmed Auth fixtures for live API tests.
// This does not change the project's signup or email confirmation settings.
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readEnvProperties } from "./envProperties.mjs";
import { fileURLToPath } from "node:url";
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const { env } = await readEnvProperties({ rootDir });
const accounts = ["A", "B"].map((label) => ({
  label,
  id: randomUUID(),
  email: `vidaa-test-${randomUUID()}@example.com`,
  password: randomBytes(30).toString("base64url")
}));
const sql =
  "BEGIN;\n" +
  accounts
    .map(
      (account) => `
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('00000000-0000-0000-0000-000000000000', '${account.id}', 'authenticated',
  'authenticated', '${account.email}', extensions.crypt('${account.password}', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES (gen_random_uuid(), '${account.id}', '${account.id}',
  '{"sub":"${account.id}","email":"${account.email}","email_verified":true}', 'email', now(), now());
`
    )
    .join("\n") +
  "\nCOMMIT;";
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.cache/shared-backend-test-accounts.json", import.meta.url),
  JSON.stringify({ projectUrl: env.NUVIO_SUPABASE_URL, accounts })
);
await writeFile(new URL("../.cache/shared-backend-test-accounts.sql", import.meta.url), sql);
await writeFile(
  new URL("../.cache/shared-backend-test-cleanup.sql", import.meta.url),
  `BEGIN;
DELETE FROM auth.sessions WHERE user_id IN (${accounts.map((a) => `'${a.id}'::uuid`).join(",")});
DELETE FROM auth.users WHERE id IN (${accounts.map((a) => `'${a.id}'::uuid`).join(",")}) AND email LIKE 'vidaa-test-%@example.com';
COMMIT;`
);
console.log(
  "Disposable Auth fixtures prepared under .cache; apply the SQL through the project MCP, run the live test, then apply cleanup SQL."
);
