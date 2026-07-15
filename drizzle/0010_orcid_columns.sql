-- TiDB/MySQL 8+: ADD COLUMN IF NOT EXISTS (no stored procedures).
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `orcidId` VARCHAR(19) NULL;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `orcidVerified` TINYINT(1) DEFAULT 0;
