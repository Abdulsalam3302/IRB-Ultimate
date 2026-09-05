-- Preserve legacy rows; they are not authoritative approvals until human review.
ALTER TABLE `applications` ADD COLUMN `humanDecisionByUserId` int;
--> statement-breakpoint
ALTER TABLE `applications` ADD COLUMN `humanDecisionAt` timestamp NULL;
