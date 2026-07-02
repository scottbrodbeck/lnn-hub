# LNN Hub — database migration tooling

Moves the live Client Portal database off **Lovable Cloud** into a **Supabase project we own**.
There is no direct DB connection string on Lovable Cloud, so we export via an edge function and
re-import into the target. **This was validated end-to-end against a throwaway dry-run project
(`lnn-hub-dryrun` / `ccoqwkqougipfxuveceb`) on 2026-07-01.**

## Working path (what actually ran)

All secrets live in a gitignored `tools/migrate/.env.migrate`:
`EXPORT_DATABASE_KEY` (shared key for the export function), `TARGET_DB_URL` (**Session pooler** URL —
the direct `db.<ref>.supabase.co` host is IPv6-only and won't connect from most machines),
`TARGET_URL`, `TARGET_SERVICE_KEY`.

1. **Export** (Deno — HTTPS, works fine):
   ```sh
   SUPABASE_URL=… EXPORT_DATABASE_KEY=… OUT_DIR=… deno run -A export-via-function.ts
   ```
   Pulls `manifest.json`, `schema.json`, `tables/*.json` (redacted), `auth_users.json`
   (no password hashes), and, with a second `STORAGE_ONLY=1` pass, the `storage/` files.

2. **Schema** (Node + `pg`): `node rebuild-schema.mjs`
   Resets `public` objects, then applies every migration **statement-by-statement** with a
   **per-file `search_path` reset** (the pg_dump baseline sets `search_path=''` for the session,
   which breaks later migrations that use unqualified type names). Continues past benign errors.

3. **Gap-fill** (Node): `FILES=a.sql,b.sql node apply-files.mjs`
   Re-applies specific migrations (DDL only — skips INSERT/UPDATE/DELETE) to create tables whose
   `CREATE` referenced objects defined in *later* migrations (forward-ordering failures on a clean build).

4. **Data + storage** (Node + `pg`): `node import-data.mjs`
   Loads tables + `auth.users` inside one transaction with `session_replication_role = replica`
   (FK/triggers/RLS off) and a **savepoint per table** (one failure can't abort the rest). Uses
   `json_populate_recordset` for type-safe loads; **excludes generated columns** (e.g. `confirmed_at`)
   on `auth.users`; preserves user ids so public FKs resolve; re-syncs sequences; uploads `storage/`
   over the Storage REST API. `SKIP_TABLES=crm_sync_log` (disposable 123 MB HubSpot ledger),
   `SKIP_STORAGE=1` / `STORAGE_ONLY=1` to split the passes.

`conn-test.mjs` is a quick connectivity check. `npm install` first (installs `pg`).

### TLS note
Supabase's pooler presents a self-signed CA that Node/Deno don't trust by default. These scripts
connect with `ssl: { rejectUnauthorized: false }` (encrypted, CA check skipped) — **explicitly
authorized** for this one-time migration. For stricter verification, download Supabase's CA cert
(Dashboard → Database → SSL) and pass it as `ssl: { ca }`. (Deno's TLS ignores both `rejectUnauthorized`
and a custom CA store here, which is why the DB steps run on Node, not Deno.)

## Dry-run result (2026-07-01 → `lnn-hub-dryrun`)

55 tables + 102 RLS policies; ~42 tables loaded with row counts matching source exactly (230 users,
230 profiles, 162 orgs, 349 posts, 10,001 CRM contacts, 6,359 deals, …); 1,456 storage files.
Known minor gaps: `crm_activities` 76,725/77,401 (offset-pagination loss on tied timestamps);
`admin_audit_logs` (legacy integer-vs-uuid type mismatch); `admin_daily_checklist` (check-constraint
rejects some `item_type` values).

## TODO before the REAL cutover (not just a dry run)

- **Preserve password hashes.** The export function redacts them, so all users would reset. For the
  real cutover, export `auth.users` *with* `encrypted_password` (pg_dump path, or extend the function).
- **Keyset-paginate big tables** in the export (order by a unique key, not `created_at`) — offset
  paging dropped ~0.9% of `crm_activities`.
- **Reconcile `admin_audit_logs`** type mismatch and the `admin_daily_checklist` check constraint.
- Redeploy edge functions + secrets, reconfigure auth (redirect URLs, email hook, SMTP), recreate
  cron/`pg_net`/realtime, repoint the Lovable-gateway functions (AI/HubSpot/Slack) — see the main plan.

## Alternative path (not used): pg_dump via a helper

`migrate-helper/` + `export-db.sh` + `verify.sh` implement the hash-preserving `pg_dump` route, which
needs a Postgres connection string. Kept for reference / the real cutover if we get direct DB access.
