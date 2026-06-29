# LNN Hub — database migration tooling (Lovable Cloud → our own Supabase)

A small, purpose-built exporter for the one-time clone of the live Client Portal database off
Lovable Cloud into a Supabase project we own. Mechanics are adapted from the open-source
[dreamlit-ai/lovable-cloud-to-supabase-exporter](https://github.com/dreamlit-ai/lovable-cloud-to-supabase-exporter)
(MIT), scoped down for our case (single storage bucket, maintenance-window cutover, no resume needed).

> ⚠️ **These scripts are DRAFTS and have not been run yet.** Test every step against a **throwaway
> target Supabase project** first. The auth-data load (Phase 2 of `export-db.sh`) is the part most
> likely to need adjustment — see "If the auth data load fails" below.

## Why this exists

Lovable Cloud exposes no Postgres connection string in its UI. But every Lovable Cloud edge
function has `SUPABASE_DB_URL` + `SUPABASE_SERVICE_ROLE_KEY` injected as env vars. So we deploy a
tiny **credential-broker** function (`migrate-helper`) inside Lovable, have it hand those back behind
a one-time secret, and then run standard Postgres tools locally against the source DB.

## Files

| File | Runs where | Purpose |
|---|---|---|
| `migrate-helper/index.ts` | inside **Lovable Cloud** (paste via Lovable chat) | returns the source DB URL + service-role key behind an `x-access-key` header |
| `export-db.sh` | your machine | clones schema + data (incl. `auth` users with password hashes) into the new project |
| `copy-storage.ts` | your machine (Deno) | copies Storage buckets + objects via the REST API |
| `verify.sh` | your machine | row-count reconciliation, source vs target |

## Prerequisites

- A **new, empty Supabase project** you own (the target).
- `pg_dump` + `psql` (Postgres client **15+**, matching the source's major version) on PATH.
- `deno` for the storage copy.

## Runbook

1. **Deploy the helper.** Replace `ACCESS_KEY` in `migrate-helper/index.ts` (`openssl rand -hex 24`).
   In Lovable's chat, ask it to create + deploy an edge function named `migrate-helper` with that
   code. Copy the function URL.

2. **Get the source credentials.**
   ```sh
   curl -s -X POST "<MIGRATE_HELPER_URL>" -H "x-access-key: <YOUR_ACCESS_KEY>" | jq
   # -> { db_url, service_role_key, supabase_url }
   ```
   If `db_url` host resolves IPv6-only and your machine can't connect, swap in the project's
   **Session pooler** connection string.

3. **Clone the database** (into the empty target):
   ```sh
   export SOURCE_DB_URL='<db_url from step 2>'
   export TARGET_DB_URL='<new project → Connect → Session pooler>'
   ./export-db.sh --confirm-target-blank
   ```

4. **Copy storage:**
   ```sh
   export SOURCE_URL='<supabase_url from step 2>'   SOURCE_SERVICE_KEY='<service_role_key>'
   export TARGET_URL='https://<new-ref>.supabase.co' TARGET_SERVICE_KEY='<new service_role key>'
   deno run --allow-net --allow-env copy-storage.ts
   ```

5. **Verify:**
   ```sh
   ./verify.sh
   ```
   Then do the **manual login smoke test**: log into the app (pointed at the new project) as a real
   user, by password AND by magic-link OTP. This is the go/no-go gate.

6. **Tear down:** delete the `migrate-helper` function from Lovable and rotate its access key.

## If the auth data load fails (most likely failure point)

`export-db.sh` copies the live `auth` table **data** but relies on the new project's managed `auth`
schema having a compatible column set. New projects are usually a newer GoTrue version (a superset),
so the source's column list loads fine. If Phase 2 errors on an `auth` column mismatch, switch to the
Dreamlit approach: also dump the **source** `auth` schema definition (`pg_dump --schema-only
--schema=auth`), strip `CREATE SCHEMA`, and restore it before the data load so the column sets match
exactly.

## NOT handled here (do these separately — see the migration plan)

- Redeploy the ~51 edge functions + set their secrets in the new project.
- Reconfigure Auth: provider config, redirect/site URLs, email templates, SMTP/SendGrid, `email-hook`.
- Recreate `pg_cron` jobs, `pg_net` webhooks, and any Realtime publications (managed schemas the
  dump excludes).
- Repoint the Lovable-gateway edge functions (AI via `ai.gateway.lovable.dev`; HubSpot + Slack via
  `connector-gateway.lovable.dev`) to direct providers.
- Re-register external callbacks at the new project's URLs: Intuit/QuickBooks OAuth, any Stripe
  webhooks, Zapier routes, Claude Connectors (`mcp-server`).
