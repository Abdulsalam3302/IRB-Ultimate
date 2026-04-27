-- Idempotent index additions for hot queries.
-- Wrapped in a stored procedure because MySQL has no
-- "CREATE INDEX IF NOT EXISTS" until 8.0+ for some flavours,
-- and even then bare DDL leaves stale prepared statements behind.

DROP PROCEDURE IF EXISTS add_idx_if_missing;
--> statement-breakpoint
CREATE PROCEDURE add_idx_if_missing(
  IN tbl VARCHAR(64),
  IN idx VARCHAR(64),
  IN cols VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx
  ) THEN
    SET @sql = CONCAT('CREATE INDEX `', idx, '` ON `', tbl, '`(', cols, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;
--> statement-breakpoint
CALL add_idx_if_missing('applications', 'idx_applications_applicantId', '`applicantId`');--> statement-breakpoint
CALL add_idx_if_missing('applications', 'idx_applications_status', '`status`');--> statement-breakpoint
CALL add_idx_if_missing('applications', 'idx_applications_submittedAt', '`submittedAt`');--> statement-breakpoint
CALL add_idx_if_missing('review_assignments', 'idx_reviews_applicationId', '`applicationId`');--> statement-breakpoint
CALL add_idx_if_missing('review_assignments', 'idx_reviews_committeeMemberId', '`committeeMemberId`');--> statement-breakpoint
CALL add_idx_if_missing('review_assignments', 'idx_reviews_status', '`status`');--> statement-breakpoint
CALL add_idx_if_missing('review_assignments', 'idx_reviews_expiresAt', '`expiresAt`');--> statement-breakpoint
CALL add_idx_if_missing('notifications', 'idx_notifications_userId', '`userId`');--> statement-breakpoint
CALL add_idx_if_missing('notifications', 'idx_notifications_userId_isRead', '`userId`,`isRead`');--> statement-breakpoint
CALL add_idx_if_missing('file_uploads', 'idx_files_applicationId', '`applicationId`');--> statement-breakpoint
CALL add_idx_if_missing('file_uploads', 'idx_files_userId', '`userId`');--> statement-breakpoint
CALL add_idx_if_missing('audit_log', 'idx_audit_applicationId', '`applicationId`');--> statement-breakpoint
CALL add_idx_if_missing('audit_log', 'idx_audit_userId', '`userId`');--> statement-breakpoint
CALL add_idx_if_missing('committee_members', 'idx_committee_userId', '`userId`');--> statement-breakpoint
CALL add_idx_if_missing('committee_members', 'idx_committee_isActive', '`isActive`');--> statement-breakpoint
CALL add_idx_if_missing('research_authors', 'idx_authors_applicationId', '`applicationId`');--> statement-breakpoint
CALL add_idx_if_missing('application_versions', 'idx_versions_applicationId', '`applicationId`');--> statement-breakpoint
CALL add_idx_if_missing('users', 'idx_users_email', '`email`');--> statement-breakpoint
DROP PROCEDURE add_idx_if_missing;
