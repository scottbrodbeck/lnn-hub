import pg from "pg";
const c = new pg.Client({ connectionString: process.env.TARGET_DB_URL, ssl: { rejectUnauthorized: false } });
try {
  await c.connect();
  const r = await c.query("select 1 as ok, current_database() as db");
  console.log("CONNECTED:", JSON.stringify(r.rows[0]));
} catch (e) {
  console.error("CONN FAIL:", e.message);
} finally {
  try { await c.end(); } catch { /* ignore */ }
}
