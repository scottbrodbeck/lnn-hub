// copy-storage.ts — copy Supabase Storage buckets + objects from SOURCE -> TARGET via the REST API.
//
// Streams bytes directly (source response body -> target upload body); nothing is staged to disk
// and the database is not involved. Re-runnable: existing target objects are skipped (x-upsert=false),
// so a flaky transfer can simply be re-run.
//
// ⚠️ DRAFT — NOT YET RUN. Test against the real projects (the `editor-images` bucket) before trusting.
//
// RUN:  deno run --allow-net --allow-env copy-storage.ts
//
// ENV:
//   SOURCE_URL, SOURCE_SERVICE_KEY   from migrate-helper (supabase_url + service_role_key)
//   TARGET_URL, TARGET_SERVICE_KEY   new project → Settings → API (project URL + service_role key)
//   BUCKETS                          optional, comma-separated; default = all source buckets

const SOURCE_URL = reqEnv("SOURCE_URL");
const SOURCE_KEY = reqEnv("SOURCE_SERVICE_KEY");
const TARGET_URL = reqEnv("TARGET_URL");
const TARGET_KEY = reqEnv("TARGET_SERVICE_KEY");
const ONLY = (Deno.env.get("BUCKETS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = 16;
const LIST_LIMIT = 1000;

const sHead = { apikey: SOURCE_KEY, authorization: `Bearer ${SOURCE_KEY}` };
const tHead = { apikey: TARGET_KEY, authorization: `Bearer ${TARGET_KEY}` };

type Bucket = {
  id: string; name: string; public: boolean;
  file_size_limit: number | null; allowed_mime_types: string[] | null;
};

function reqEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) { console.error(`Missing env ${name}`); Deno.exit(2); }
  return v.replace(/\/+$/, "");
}

function encPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function fetchRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  let last: Response | undefined;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.ok || res.status === 404 || res.status === 409) return res;
    if (![408, 425, 429, 500, 502, 503, 504].includes(res.status)) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return last!;
}

async function listBuckets(base: string, h: Record<string, string>): Promise<Bucket[]> {
  const r = await fetch(`${base}/storage/v1/bucket`, { headers: h });
  if (!r.ok) throw new Error(`list buckets (${base}): ${r.status} ${await r.text()}`);
  return await r.json();
}

async function ensureBucket(b: Bucket, targetBuckets: Bucket[]): Promise<void> {
  if (targetBuckets.some((x) => x.id === b.id)) return;
  const r = await fetch(`${TARGET_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...tHead, "content-type": "application/json" },
    body: JSON.stringify({
      id: b.id, name: b.name, public: b.public,
      file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types,
    }),
  });
  if (!r.ok && r.status !== 409) throw new Error(`create bucket ${b.id}: ${r.status} ${await r.text()}`);
  console.log(`bucket created: ${b.id} (public=${b.public})`);
}

// Recursively list every object path in a bucket via the Storage list API.
async function listObjects(bucket: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(prefix: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const r = await fetchRetry(`${SOURCE_URL}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { ...sHead, "content-type": "application/json" },
        body: JSON.stringify({ prefix, limit: LIST_LIMIT, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!r.ok) throw new Error(`list ${bucket}/${prefix}: ${r.status} ${await r.text()}`);
      const items = await r.json() as Array<{ name: string; id: string | null }>;
      if (items.length === 0) break;
      for (const it of items) {
        const full = prefix ? `${prefix}/${it.name}` : it.name;
        if (it.id === null) await walk(full); // folder
        else out.push(full);                  // file
      }
      if (items.length < LIST_LIMIT) break;
      offset += LIST_LIMIT;
    }
  }
  await walk("");
  return out;
}

async function copyObject(bucket: string, path: string): Promise<"copied" | "exists" | "missing"> {
  const src = await fetchRetry(`${SOURCE_URL}/storage/v1/object/${bucket}/${encPath(path)}`, { headers: sHead });
  if (src.status === 404) return "missing";
  if (!src.ok) throw new Error(`download ${bucket}/${path}: ${src.status}`);
  const up = await fetch(`${TARGET_URL}/storage/v1/object/${bucket}/${encPath(path)}`, {
    method: "POST",
    headers: {
      ...tHead,
      "content-type": src.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": src.headers.get("cache-control") ?? "3600",
      "x-upsert": "false",
    },
    body: src.body,
    // @ts-ignore — Deno fetch supports duplex for streaming request bodies
    duplex: "half",
  });
  if (up.status === 409) return "exists";
  if (!up.ok) throw new Error(`upload ${bucket}/${path}: ${up.status} ${await up.text()}`);
  return "copied";
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}

const srcBuckets = await listBuckets(SOURCE_URL, sHead);
const tgtBuckets = await listBuckets(TARGET_URL, tHead);
const buckets = ONLY.length ? srcBuckets.filter((b) => ONLY.includes(b.id)) : srcBuckets;

for (const b of buckets) {
  await ensureBucket(b, tgtBuckets);
  const paths = await listObjects(b.id);
  console.log(`bucket ${b.id}: ${paths.length} objects`);
  let copied = 0, exists = 0, missing = 0;
  await pool(paths, CONCURRENCY, async (p) => {
    const res = await copyObject(b.id, p);
    if (res === "copied") copied++; else if (res === "exists") exists++; else missing++;
  });
  console.log(`bucket ${b.id}: copied=${copied} already-present=${exists} missing-source=${missing}`);
}
console.log("storage copy complete.");
