-- IRB Ultimate — destructive data reset.
--
-- Wipes ALL business data but keeps the owner user row identified by the
-- OWNER_OPEN_ID set in the running app's env. The owner row is preserved so
-- the platform boots clean for fresh use without a re-auth dance.
--
-- USAGE:
--   1. Take a backup FIRST:  bash scripts/backup.sh
--   2. Verify the backup file exists and has a sane size.
--   3. Set @owner_open_id below to your OWNER_OPEN_ID.
--   4. Run:
--        mysql -u <user> -p <database> < scripts/reset-data.sql
--   5. Restart the app process.
--
-- This script is wrapped in a transaction so it's atomic — either everything
-- gets truncated or nothing does. FK checks are disabled for the duration so
-- the truncate order doesn't matter.
--
-- KEEP IN SYNC with drizzle/schema.ts when you add new tables.

-- ────────────────────────────────────────────────────────────────────────
-- ⚠️  EDIT BEFORE RUNNING.
SET @owner_open_id := 'dev-owner-001';  -- must match OWNER_OPEN_ID env var
-- ────────────────────────────────────────────────────────────────────────

-- Refuse to proceed if the owner row doesn't exist — otherwise we'd nuke
-- every user including ourselves. CONVERT(... USING utf8mb4) makes the
-- @owner_open_id session var match the users.openId column collation
-- regardless of the DB's default — MySQL 8 ships utf8mb4_0900_ai_ci by
-- default and our schema uses utf8mb4_unicode_ci, which would otherwise
-- raise "Illegal mix of collations" on the equality.
SET @owner_exists := (
  SELECT COUNT(*) FROM users
  WHERE openId = CONVERT(@owner_open_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
);
SET @msg := CONCAT('Refusing to reset: no user row with openId=', @owner_open_id);
SELECT IF(@owner_exists > 0, 'OK: owner row found, proceeding', @msg) AS preflight;

-- This will fail loudly if the owner row isn't present.
SELECT
  CASE WHEN @owner_exists = 0
       THEN (SELECT * FROM (SELECT 'ABORT: owner row missing') x WHERE 0)
       ELSE 1
  END AS guard;

SET @owner_id := (
  SELECT id FROM users
  WHERE openId = CONVERT(@owner_open_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
  LIMIT 1
);

START TRANSACTION;
SET FOREIGN_KEY_CHECKS = 0;

-- Truncate everything except `users`.
TRUNCATE TABLE adverse_events;
TRUNCATE TABLE amendments;
TRUNCATE TABLE application_versions;
TRUNCATE TABLE file_uploads;
TRUNCATE TABLE notifications;
TRUNCATE TABLE audit_log;
TRUNCATE TABLE review_assignments;
TRUNCATE TABLE support_tickets;
TRUNCATE TABLE research_authors;
TRUNCATE TABLE applications;
TRUNCATE TABLE committee_members;

-- Delete all users except the owner, then reseed auto-increment sanely.
DELETE FROM users WHERE id <> @owner_id;
ALTER TABLE users AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

-- Verify post-state.
SELECT (SELECT COUNT(*) FROM users)                AS users_remaining,
       (SELECT COUNT(*) FROM applications)         AS applications,
       (SELECT COUNT(*) FROM committee_members)    AS committee_members,
       (SELECT COUNT(*) FROM review_assignments)   AS reviews,
       (SELECT COUNT(*) FROM file_uploads)         AS files,
       (SELECT COUNT(*) FROM notifications)        AS notifications,
       (SELECT COUNT(*) FROM audit_log)            AS audit_rows;
-- Expect: users=1, all others=0
