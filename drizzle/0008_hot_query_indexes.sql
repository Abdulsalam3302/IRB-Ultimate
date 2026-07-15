-- Idempotent index additions for hot queries.
-- Plain CREATE INDEX IF NOT EXISTS — works on MySQL 8+ and TiDB Serverless
-- (stored procedures / PREPARE are not supported on TiDB).

CREATE INDEX IF NOT EXISTS `idx_applications_applicantId` ON `applications` (`applicantId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_applications_status` ON `applications` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_applications_submittedAt` ON `applications` (`submittedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reviews_applicationId` ON `review_assignments` (`applicationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reviews_committeeMemberId` ON `review_assignments` (`committeeMemberId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reviews_status` ON `review_assignments` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reviews_expiresAt` ON `review_assignments` (`expiresAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_userId` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_userId_isRead` ON `notifications` (`userId`,`isRead`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_files_applicationId` ON `file_uploads` (`applicationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_files_userId` ON `file_uploads` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_applicationId` ON `audit_log` (`applicationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_userId` ON `audit_log` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_committee_userId` ON `committee_members` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_committee_isActive` ON `committee_members` (`isActive`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_authors_applicationId` ON `research_authors` (`applicationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_versions_applicationId` ON `application_versions` (`applicationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_users_email` ON `users` (`email`);
