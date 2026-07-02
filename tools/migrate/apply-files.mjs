import pg from "pg";
import { readFile } from "node:fs/promises";

const MIG = process.env.MIGRATIONS_DIR;
const FILES = process.env.FILES.split(",").map((s) => s.trim()).filter(Boolean);
const c = new pg.Client({ connectionString: process.env.TARGET_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

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

const dataRe = /^\s*(insert|update|delete|truncate)\b/i;
for (const f of FILES) {
  await c.query("set search_path to public, extensions;").catch(() => {});
  const stmts = splitStatements(await readFile(`${MIG}/${f}`, "utf8"));
  for (const s of stmts) {
    if (dataRe.test(s)) continue; // DDL only — don't touch loaded data
    try { await c.query(s); }
    catch (e) {
      const m = e.message.split("\n")[0];
      if (!/already exists|does not exist, skipping/i.test(m)) console.log(`[${f.slice(0, 15)}] ${m}\n    ${s.slice(0, 100).replace(/\s+/g, " ")}`);
    }
  }
}
await c.end();
console.log("done");
