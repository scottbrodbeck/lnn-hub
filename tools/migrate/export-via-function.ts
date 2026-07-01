// export-via-function.ts — pull a "good enough" export from the Client Portal's `export-database`
// edge function into local JSON files (+ storage bytes). This is the FALLBACK path, used while the
// hash-preserving pg_dump route is blocked.
//
// AUTH: the function accepts a shared key via the `x-export-key` header (the EXPORT_DATABASE_KEY
// secret configured in Lovable) — no user login / JWT required.
//
// IMPORTANT LIMITATIONS (by design — the function redacts secrets):
//   • auth users come WITHOUT password hashes -> users reset / use magic-link on first login.
//   • auth.identities and sessions/refresh_tokens are NOT exported.
//   • Denylisted tables are skipped: otp_codes, qbo_auth_state, crm_user_push_quota.
//   • Output is JSON — loading it into the target is a separate step (import-into-supabase.ts).
//
// RUN:
//   export SUPABASE_URL='https://nsqosbysixcjcwkdpajk.supabase.co'
//   export EXPORT_DATABASE_KEY='<EXPORT_DATABASE_KEY secret from Lovable → Cloud → Secrets>'
//   # optional: OUT_DIR (default ./export), TABLE_PAGE (default 2000), SKIP_STORAGE=1
//   deno run --allow-net --allow-env --allow-write --allow-read export-via-function.ts

const SUPABASE_URL = need("SUPABASE_URL").replace(/\/+$/, "");
const EXPORT_KEY = need("EXPORT_DATABASE_KEY");
const OUT = Deno.env.get("OUT_DIR") ?? "./export";
const TABLE_PAGE = Number(Deno.env.get("TABLE_PAGE") ?? 2000);
const SKIP_STORAGE = Deno.env.get("SKIP_STORAGE") === "1";
const FN = `${SUPABASE_URL}/functions/v1/export-database`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function need(n: string): string {
  const v = Deno.env.get(n);
  if (!v) { console.error(`Missing env ${n}`); Deno.exit(2); }
  return v;
}

// deno-lint-ignore no-explicit-any
async function fn(body: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(FN, {
      method: "POST",
      headers: { "x-export-key": EXPORT_KEY, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 429) { await sleep(5000); continue; } // rate limited -> wait
    if (r.status === 401 || r.status === 403) {
      console.error(`Auth failed (${r.status}) — check EXPORT_DATABASE_KEY matches the secret set in Lovable.`);
      console.error(await r.text());
      Deno.exit(1);
    }
    if (!r.ok) throw new Error(`${JSON.stringify(body)} -> ${r.status} ${await r.text()}`);
    return await r.json();
  }
  throw new Error(`too many retries for ${JSON.stringify(body)}`);
}

const write = (p: string, o: unknown) => Deno.writeTextFile(p, JSON.stringify(o, null, 2));
const dirname = (p: string) => p.split("/").slice(0, -1).join("/");

await Deno.mkdir(`${OUT}/tables`, { recursive: true });

console.log("→ manifest");
const manifest = await fn({ mode: "manifest" });
await write(`${OUT}/manifest.json`, manifest);

console.log("→ schema");
await write(`${OUT}/schema.json`, await fn({ mode: "schema" }));

for (const t of manifest.tables as Array<{ table: string; skipped?: boolean }>) {
  if (t.skipped) { console.log(`  skip ${t.table} (denylisted)`); continue; }
  const rows: unknown[] = [];
  let offset = 0;
  for (;;) {
    const page = await fn({ mode: "table", table: t.table, offset, limit: TABLE_PAGE });
    const got: unknown[] = page.rows ?? [];
    rows.push(...got);
    if (got.length < TABLE_PAGE) break;
    offset += TABLE_PAGE;
  }
  await write(`${OUT}/tables/${t.table}.json`, rows);
  console.log(`  table ${t.table}: ${rows.length} rows`);
}

console.log("→ auth_users");
const users: unknown[] = [];
let uoff = 0; const ulim = 1000;
for (;;) {
  const page = await fn({ mode: "auth_users", offset: uoff, limit: ulim });
  const got: unknown[] = page.rows ?? [];
  users.push(...got);
  uoff += ulim;
  if (got.length < ulim || uoff >= Number(page.total ?? 0)) break;
}
await write(`${OUT}/auth_users.json`, users);
console.log(`  auth_users: ${users.length} (no password hashes)`);

if (!SKIP_STORAGE) {
  for (const b of manifest.storage as Array<{ bucket: string; objects: Array<{ path: string }> }>) {
    let ok = 0, miss = 0;
    for (const o of b.objects) {
      const sig = await fn({ mode: "storage", bucket: b.bucket, path: o.path });
      const res = await fetch(sig.signed_url);
      if (!res.ok) { miss++; continue; }
      const dest = `${OUT}/storage/${b.bucket}/${o.path}`;
      await Deno.mkdir(dirname(dest), { recursive: true });
      await Deno.writeFile(dest, new Uint8Array(await res.arrayBuffer()));
      ok++;
    }
    console.log(`  storage ${b.bucket}: ${ok} downloaded, ${miss} missing`);
  }
}

console.log(`\n✓ Export complete → ${OUT}`);
