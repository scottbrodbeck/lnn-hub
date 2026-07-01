// import-into-supabase.ts — load an export/ folder (produced by export-via-function.ts) into a NEW
// Supabase project we own. Pairs with the "good enough" fallback export.
//
// Loads table rows + auth.users (PRESERVING ids so public → auth foreign keys stay intact) via a
// direct Postgres connection with FK checks / triggers / RLS disabled, then re-syncs sequences and
// uploads storage files via the Storage API. Uses json_populate_recordset so each field is cast to
// the real column type (handles jsonb, arrays, timestamps) instead of hand-building column lists.
//
// ⚠️ DRAFT — test against a throwaway target first. Known risk points are flagged inline.
//
// PREREQUISITE — the target SCHEMA must already exist. Create it first from the repo root:
//     supabase link --project-ref <target-ref>
//     supabase db push            # applies supabase/migrations/ to the new project
//
// LIMITATIONS inherited from the export: no password hashes (users reset / use magic-link on first
// login), auth.identities/OAuth not restored, denylisted tables skipped.
//
// RUN:
//   export TARGET_DB_URL='postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres?sslmode=require'
//   export TARGET_URL='https://<ref>.supabase.co'   TARGET_SERVICE_KEY='<target service_role key>'
//   export EXPORT_DIR='./export'   # optional, default ./export
//   deno run --allow-net --allow-env --allow-read import-into-supabase.ts

import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TARGET_DB_URL = need("TARGET_DB_URL");
const TARGET_URL = need("TARGET_URL").replace(/\/+$/, "");
const TARGET_SERVICE_KEY = need("TARGET_SERVICE_KEY");
const EXPORT_DIR = Deno.env.get("EXPORT_DIR") ?? "./export";
const BATCH = 1000;

// GoTrue defines several token columns as NOT NULL DEFAULT ''. The export omits them (redacted),
// so we set them to '' to avoid NOT NULL violations on insert. If auth load fails on another
// NOT NULL column, add it here.
const AUTH_EMPTY_STRING_COLS = [
  "confirmation_token", "recovery_token", "email_change", "email_change_token_new",
  "email_change_token_current", "phone_change", "phone_change_token", "reauthentication_token",
];

function need(n: string): string {
  const v = Deno.env.get(n);
  if (!v) { console.error(`Missing env ${n}`); Deno.exit(2); }
  return v;
}
// deno-lint-ignore no-explicit-any
const readJson = async (p: string): Promise<any> => JSON.parse(await Deno.readTextFile(p));

const sql = postgres(TARGET_DB_URL, { prepare: false, ssl: "require", onnotice: () => {} });
const supa = createClient(TARGET_URL, TARGET_SERVICE_KEY, { auth: { persistSession: false } });

const manifest = await readJson(`${EXPORT_DIR}/manifest.json`);

// Guard: refuse if the target schema hasn't been created yet.
const [{ count }] = await sql`
  select count(*)::int as count from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'`;
if (count === 0) {
  console.error("Target has no public tables. Create the schema first: supabase link && supabase db push");
  await sql.end();
  Deno.exit(3);
}

// deno-lint-ignore no-explicit-any
async function loadRows(tx: any, schemaTable: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await tx.unsafe(
      `insert into ${schemaTable} select * from json_populate_recordset(null::${schemaTable}, $1::json) on conflict do nothing`,
      [JSON.stringify(chunk)],
    );
  }
}

await sql.begin(async (tx) => {
  await tx.unsafe("set session_replication_role = replica"); // disable FK/triggers/RLS during load

  for (const t of manifest.tables as Array<{ table: string; skipped?: boolean }>) {
    if (t.skipped) continue;
    let rows: Record<string, unknown>[];
    try { rows = await readJson(`${EXPORT_DIR}/tables/${t.table}.json`); } catch { continue; }
    if (!rows.length) continue;
    await loadRows(tx, `public.${JSON.stringify(t.table).slice(1, -1)}`, rows);
    console.log(`loaded public.${t.table}: ${rows.length}`);
  }

  // auth.users — preserve ids so the public FKs above resolve. Passwords are absent → reset on login.
  let users: Record<string, unknown>[] = [];
  try { users = await readJson(`${EXPORT_DIR}/auth_users.json`); } catch { /* none */ }
  for (const u of users) for (const c of AUTH_EMPTY_STRING_COLS) if (u[c] == null) u[c] = "";
  if (users.length) {
    await loadRows(tx, "auth.users", users);
    console.log(`loaded auth.users: ${users.length} (no passwords — reset / magic-link on first login)`);
  }
});

// Re-sync public sequences to MAX(owning column).
await sql.unsafe(`
do $$
declare r record; maxv bigint;
begin
  for r in
    select n.nspname sch, s.relname seq, t.relname tbl, a.attname col
    from pg_class s join pg_namespace n on n.oid=s.relnamespace
    join pg_depend d on d.objid=s.oid and d.deptype='a'
    join pg_class t on t.oid=d.refobjid
    join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
    where s.relkind='S' and n.nspname='public'
  loop
    execute format('select coalesce(max(%I),0) from %I.%I', r.col, r.sch, r.tbl) into maxv;
    execute format('select setval(%L, greatest(%s,1), %L)', r.sch||'.'||r.seq, maxv, maxv>0);
  end loop;
end $$;`);
console.log("sequences re-synced");

// Storage: recreate buckets + upload files. Bucket flags aren't in the export manifest, so we
// special-case the known public bucket; everything else is created private (safer for tax-documents).
for (const b of (manifest.storage ?? []) as Array<{ bucket: string; objects: Array<{ path: string }> }>) {
  await supa.storage.createBucket(b.bucket, { public: b.bucket === "editor-images" }).catch(() => {});
  let ok = 0, miss = 0;
  for (const o of b.objects) {
    let bytes: Uint8Array;
    try { bytes = await Deno.readFile(`${EXPORT_DIR}/storage/${b.bucket}/${o.path}`); } catch { miss++; continue; }
    const { error } = await supa.storage.from(b.bucket).upload(o.path, bytes, { upsert: true });
    if (error) console.log(`  upload fail ${b.bucket}/${o.path}: ${error.message}`); else ok++;
  }
  console.log(`storage ${b.bucket}: uploaded ${ok}, missing-local ${miss}`);
}

await sql.end();
console.log("\n✓ Import complete. Verify row counts, then do the login smoke test (magic-link OTP or password reset).");
