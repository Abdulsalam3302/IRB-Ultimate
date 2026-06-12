// One-off, tightly-scoped cleanup of @example.com TEST accounts created
// during development, plus their applications and dependent rows.
// Runs with prod env via: railway run -- node scripts/cleanup-test-accounts.mjs
// Safety: asserts every targeted user email ends with @example.com before
// deleting anything; runs in a single transaction.
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await mysql.createConnection(url);
try {
  const [users] = await conn.query("SELECT id, email FROM users WHERE email LIKE '%@example.com'");
  if (!users.length) { console.log("No @example.com test users found. Nothing to do."); process.exit(0); }

  // Hard safety: refuse if any target is NOT @example.com.
  if (!users.every(u => String(u.email).toLowerCase().endsWith("@example.com"))) {
    console.error("ABORT: a target email is not @example.com"); process.exit(1);
  }
  const userIds = users.map(u => u.id);
  console.log("Test users to delete:", users.map(u => `${u.id}:${u.email}`).join(", "));

  const [apps] = await conn.query("SELECT id FROM applications WHERE applicantId IN (?)", [userIds]);
  const appIds = apps.map(a => a.id);
  console.log(`Applications to delete: ${appIds.length}${appIds.length ? " (" + appIds.join(",") + ")" : ""}`);

  await conn.beginTransaction();
  const del = async (sql, params) => {
    try { const [r] = await conn.query(sql, params); return r.affectedRows ?? 0; }
    catch (e) { console.warn("  skip:", sql.split(" WHERE")[0], "-", e.code || e.message); return 0; }
  };

  if (appIds.length) {
    for (const t of ["research_authors","review_assignments","application_versions","adverse_events","amendments","ai_swarm_reviews","file_uploads","notifications","audit_log"]) {
      const n = await del(`DELETE FROM ${t} WHERE applicationId IN (?)`, [appIds]);
      if (n) console.log(`  ${t} (by application): ${n}`);
    }
    const a = await del("DELETE FROM applications WHERE id IN (?)", [appIds]);
    console.log(`  applications: ${a}`);
  }
  // Rows tied directly to the test users (not via an application).
  for (const t of ["committee_members","notifications","audit_log"]) {
    const n = await del(`DELETE FROM ${t} WHERE userId IN (?)`, [userIds]);
    if (n) console.log(`  ${t} (by user): ${n}`);
  }
  const u = await del("DELETE FROM users WHERE id IN (?)", [userIds]);
  console.log(`  users: ${u}`);

  await conn.commit();
  console.log("Cleanup committed.");
} catch (e) {
  try { await conn.rollback(); } catch {}
  console.error("Cleanup failed, rolled back:", e.message);
  process.exit(1);
} finally {
  await conn.end();
}
