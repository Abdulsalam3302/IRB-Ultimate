ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `identityIssuer` varchar(1024) NULL;
--> statement-breakpoint
ALTER TABLE `storage_deletion_jobs` MODIFY COLUMN `reason` enum('upload_cleanup','account_erasure','identity_erasure') NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `storage_identity_tombstone_idx` ON `storage_deletion_jobs` (`reason`,`fileKey`);
