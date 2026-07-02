import pg from "pg";
import { readFile } from "node:fs/promises";

const DB = process.env.TARGET_DB_URL;
const TARGET_URL = process.env.TARGET_URL.replace(/\/+$/, "");
const SERVICE_KEY = process.env.TARGET_SERVICE_KEY;
const EXPORT_DIR = process.env.EXPORT_DIR;
const SKIP = new Set((process.env.SKIP_TABLES || "").split(",").map((s) => s.trim()).filter(Boolean));
const SKIP_STORAGE = process.env.SKIP_STORAGE === "1";
const BATCH = 1000;
const AUTH_EMPTY = ["confirmation_token", "recovery_token", "email_change", "email_change_token_new",
  "email_change_token_current", "phone_change", "phone_change_token", "reauthentication_token"];
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  heic: "image/heic", svg: "image/svg+xml", mp4: "video/mp4", pdf: "application/pdf" };

const manifest = JSON.parse(await readFile(`${EXPORT_DIR}/manifest.json`, "utf8"));
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
await client.connect();

async function loadRows(schemaTable, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await client.query(
      `insert into ${schemaTable} select * from json_populate_recordset(null::${schemaTable}, $1::json) on conflict do nothing`,
      [JSON.stringify(chunk)],
    );
  }
}

// ---- data + auth.users, FK/triggers/RLS disabled ----
await client.query("begin");
let replica = false;
try {
  await client.query("set session_replication_role = replica");
  const rr = await client.query("show session_replication_role");
  replica = rr.rows[0].session_replication_role === "replica";
} catch { /* ignore */ }
console.log(`session_replication_role: ${replica ? "replica (FK/triggers off)" : "NOT set — FK checks ON"}`);

async function loadTable(schemaTable, rows, label) {
  await client.query("savepoint sp");
  try {
    await loadRows(schemaTable, rows);
    await client.query("release savepoint sp");
    console.log(`loaded ${label}: ${rows.length}`);
  } catch (e) {
    await client.query("rollback to savepoint sp");
    console.log(`FAIL ${label}: ${e.message.split("\n")[0]}`);
  }
}

for (const t of manifest.tables) {
  if (t.skipped || SKIP.has(t.table)) { console.log(`skip ${t.table}`); continue; }
  let rows;
  try { rows = JSON.parse(await readFile(`${EXPORT_DIR}/tables/${t.table}.json`, "utf8")); } catch { continue; }
  if (!rows.length) continue;
  await loadTable(`public."${t.table}"`, rows, `public.${t.table}`);
}
let users = [];
try { users = JSON.parse(await readFile(`${EXPORT_DIR}/auth_users.json`, "utf8")); } catch { /* none */ }
for (const u of users) for (const k of AUTH_EMPTY) if (u[k] == null) u[k] = "";
if (users.length) {
  // Exclude generated columns (e.g. confirmed_at) — they can't be inserted into.
  const genRows = (await client.query(
    "select column_name from information_schema.columns where table_schema='auth' and table_name='users' and is_generated='ALWAYS'"
  )).rows;
  const gen = new Set(genRows.map((r) => r.column_name));
  const cols = Object.keys(users[0]).filter((c) => !gen.has(c)).map((c) => `"${c}"`).join(",");
  await client.query("savepoint sp");
  try {
    for (let i = 0; i < users.length; i += BATCH) {
      const chunk = users.slice(i, i + BATCH);
      await client.query(
        `insert into auth.users (${cols}) select ${cols} from json_populate_recordset(null::auth.users, $1::json) on conflict do nothing`,
        [JSON.stringify(chunk)],
      );
    }
    await client.query("release savepoint sp");
    console.log(`loaded auth.users: ${users.length} (excluded generated cols; no passwords)`);
  } catch (e) {
    await client.query("rollback to savepoint sp");
    console.log(`FAIL auth.users: ${e.message.split("\n")[0]}`);
  }
}
await client.query("commit");

// ---- resync sequences ----
await client.query(`do $$ declare r record; maxv bigint; begin
  for r in select n.nspname sch,s.relname seq,t.relname tbl,a.attname col
    from pg_class s join pg_namespace n on n.oid=s.relnamespace
    join pg_depend d on d.objid=s.oid and d.deptype='a'
    join pg_class t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
    where s.relkind='S' and n.nspname='public' loop
    execute format('select coalesce(max(%I),0) from %I.%I', r.col,r.sch,r.tbl) into maxv;
    execute format('select setval(%L, greatest(%s,1), %L)', r.sch||'.'||r.seq, maxv, maxv>0);
  end loop; end $$;`);
console.log("sequences resynced");
await client.end();

// ---- storage upload via REST (HTTPS API; publicly-trusted cert) ----
if (!SKIP_STORAGE) {
  const H = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };
  for (const b of (manifest.storage || [])) {
    await fetch(`${TARGET_URL}/storage/v1/bucket`, {
      method: "POST", headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ id: b.bucket, name: b.bucket, public: b.bucket === "editor-images" }),
    }).catch(() => {});
    const objs = b.objects;
    let ok = 0, miss = 0, fail = 0, idx = 0;
    async function worker() {
      while (idx < objs.length) {
        const o = objs[idx++];
        let bytes;
        try { bytes = await readFile(`${EXPORT_DIR}/storage/${b.bucket}/${o.path}`); } catch { miss++; continue; }
        const ext = o.path.split(".").pop().toLowerCase();
        const enc = o.path.split("/").map(encodeURIComponent).join("/");
        const r = await fetch(`${TARGET_URL}/storage/v1/object/${b.bucket}/${enc}`, {
          method: "POST",
          headers: { ...H, "x-upsert": "true", "content-type": MIME[ext] || "application/octet-stream" },
          body: bytes,
        });
        if (r.ok) ok++; else fail++;
      }
    }
    await Promise.all(Array.from({ length: 12 }, worker));
    console.log(`storage ${b.bucket}: uploaded ${ok}, missing-local ${miss}, failed ${fail}`);
  }
}
console.log("\n✓ import-data complete");
