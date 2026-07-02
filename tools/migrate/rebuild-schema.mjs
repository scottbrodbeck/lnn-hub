import pg from "pg";
import { readdir, readFile } from "node:fs/promises";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR;
const c = new pg.Client({ connectionString: process.env.TARGET_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// --- 1. Reset all user objects in public (preserve the schema + its grants) ---
console.log("resetting public schema objects…");
await c.query(`
do $$ declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute 'drop table if exists public.'||quote_ident(r.tablename)||' cascade'; end loop;
  for r in (select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') loop
    execute 'drop function if exists '||r.f||' cascade'; end loop;
  for r in select sequencename from pg_sequences where schemaname='public' loop
    execute 'drop sequence if exists public.'||quote_ident(r.sequencename)||' cascade'; end loop;
  for r in (select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace
            where n.nspname='public' and t.typtype in ('e','c','d')
              and not exists (select 1 from pg_class where reltype=t.oid)) loop
    execute 'drop type if exists public.'||quote_ident(r.typname)||' cascade'; end loop;
end $$;`);

// --- 2. Split SQL into statements (dollar-quote / quote / comment aware) ---
function splitStatements(sql) {
  const out = [];
  let cur = "", i = 0;
  const n = sql.length;
  let inS = false, inD = false, line = false, block = false, tag = null;
  while (i < n) {
    const ch = sql[i], two = sql.slice(i, i + 2);
    if (line) { cur += ch; if (ch === "\n") line = false; i++; continue; }
    if (block) { cur += ch; if (two === "*/") { cur += sql[i + 1]; i += 2; block = false; continue; } i++; continue; }
    if (tag) { if (sql.startsWith(tag, i)) { cur += tag; i += tag.length; tag = null; continue; } cur += ch; i++; continue; }
    if (inS) { cur += ch; if (ch === "'") { if (sql[i + 1] === "'") { cur += "'"; i += 2; continue; } inS = false; } i++; continue; }
    if (inD) { cur += ch; if (ch === '"') inD = false; i++; continue; }
    if (two === "--") { line = true; cur += two; i += 2; continue; }
    if (two === "/*") { block = true; cur += two; i += 2; continue; }
    if (ch === "'") { inS = true; cur += ch; i++; continue; }
    if (ch === '"') { inD = true; cur += ch; i++; continue; }
    if (ch === "$") { const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i)); if (m) { tag = m[0]; cur += tag; i += tag.length; continue; } }
    if (ch === ";") { const t = cur.trim(); if (t) out.push(t); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// --- 3. Apply every migration, statement-by-statement, continue on error ---
const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
let okStmts = 0;
const failures = [];
for (const f of files) {
  // Each migration on the live DB ran in a fresh session (default search_path). The pg_dump
  // baseline sets search_path='' persistently, which breaks later migrations that use unqualified
  // type names — so restore a sane search_path before every file.
  await c.query("SET search_path TO public, extensions;").catch(() => {});
  const stmts = splitStatements(await readFile(`${MIGRATIONS_DIR}/${f}`, "utf8"));
  for (const s of stmts) {
    try { await c.query(s); okStmts++; }
    catch (e) { failures.push({ f, msg: e.message.split("\n")[0], stmt: s.slice(0, 90).replace(/\s+/g, " ") }); }
  }
}

console.log(`\nstatements ok: ${okStmts}, failed: ${failures.length}`);
// Show only failures that are NOT "already exists" (benign) to surface real problems
const real = failures.filter((x) => !/already exists|does not exist, skipping/i.test(x.msg));
console.log(`non-benign failures: ${real.length}`);
for (const x of real.slice(0, 25)) console.log(`  [${x.f.slice(0, 20)}] ${x.msg}\n      ${x.stmt}`);

const r = await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
console.log(`\npublic tables now: ${r.rows[0].n}`);
await c.end();
