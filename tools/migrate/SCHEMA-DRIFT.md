# Schema drift reconciliation (staging → repo)

## What happened
The staging DB (`ccoqwkqougipfxuveceb`) was populated by copying Lovable's database
snapshot directly. That snapshot was missing **18 repo migrations** — they exist in
`supabase/migrations/` but were never applied to Lovable's live DB ("repo drift").
Because the snapshot carried **no `supabase_migrations.schema_migrations` table**,
nothing flagged the gap until a WordPress-site save failed on a missing
`sites.mailchimp_config` column.

This is drift, **not** a lossy copy — the missing migrations are scattered from
2025‑11 to 2026‑06, which only makes sense if they were never applied upstream. The
copy process itself is faithful.

## Detection method (reusable at go-live)
Compare what the repo migrations create vs. what the target DB actually has:
- Parse every `supabase/migrations/*.sql` for `ADD COLUMN` / `CREATE TABLE`
  (net of later `DROP COLUMN` / `DROP TABLE` / `RENAME`).
- Compare against `information_schema.columns` / `.tables` on the target
  (query via the Supabase Management API: `POST /v1/projects/{ref}/database/query`
  with `curl` — Python's urllib is Cloudflare-fingerprint-blocked on api.supabase.com).
- Apply the implicated migration files in **chronological order**; re-scan to confirm 0.

Caveat: this scan covers **tables/columns only** (the class that throws hard
"column does not exist" errors). Drift in views / functions / RLS policies / indexes on
migrations that don't add columns is **not** covered — do a deeper audit before prod.

## Applied to staging on 2026-07-02 (18 migrations)
First batch (site-save fix + two siblings):
- 20260610175704  post_edit_requests featured-image cols
- 20260612164758  sites.mailchimp_config + email_blasts mailchimp cols + sites_public view
- 20260623054338  organizations.stat_email_suppress

Full reconciliation batch (chronological):
- 20260427194031, 20260429010110, 20260429011944, 20260429015906, 20260429044910,
  20260429205243, 20260429213949, 20260430160721, 20260504164918, 20260516051545,
  20260516054251, 20260517150407, 20260519053717, 20260521035419, 20260612210057

Post-check: **0 missing tables, 0 missing columns.**

## GO-LIVE action (production cutover)
After copying the production snapshot into the prod Supabase project:
1. Run the detection scan above against prod.
2. Apply the missing migrations in chronological order.
3. Re-scan to confirm 0 table/column drift.
4. Do a functions/views/policies drift review (not covered by the column scan).
