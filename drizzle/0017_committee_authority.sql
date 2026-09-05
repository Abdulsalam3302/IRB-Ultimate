-- Existing automated membership is not evidence of a human appointment.
-- Nullable fields intentionally leave legacy seats unqualified until reappointed.
ALTER TABLE `committee_members` ADD COLUMN `qualificationReference` text;
--> statement-breakpoint
ALTER TABLE `committee_members` ADD COLUMN `appointedByUserId` int;
--> statement-breakpoint
ALTER TABLE `committee_members` ADD COLUMN `appointedAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `idx_files_key` ON `file_uploads` (`fileKey`);
--> statement-breakpoint
CREATE INDEX `idx_reviews_application_member_status` ON `review_assignments` (`applicationId`, `committeeMemberId`, `status`);
