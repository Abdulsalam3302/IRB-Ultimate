ALTER TABLE `file_uploads` ADD COLUMN IF NOT EXISTS `storageProvider` varchar(16) NULL;
--> statement-breakpoint
ALTER TABLE `file_uploads` ADD COLUMN IF NOT EXISTS `storageOrigin` varchar(1024) NULL;
--> statement-breakpoint
ALTER TABLE `file_uploads` ADD COLUMN IF NOT EXISTS `storageBucket` varchar(128) NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `storage_quota_lock` (`id` int NOT NULL PRIMARY KEY);
--> statement-breakpoint
INSERT IGNORE INTO `storage_quota_lock` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `storage_deletion_jobs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `fileKey` varchar(512) NOT NULL,
  `fileSize` int NOT NULL,
  `storageProvider` varchar(16) NULL,
  `storageOrigin` varchar(1024) NULL,
  `storageBucket` varchar(128) NULL,
  `reason` enum('upload_cleanup','account_erasure') NOT NULL,
  `status` enum('reserved','pending','processing','completed','cancelled','blocked') NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `lastErrorCode` varchar(64) NULL,
  `nextAttemptAt` timestamp NOT NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `storage_deletion_due_idx` (`status`,`nextAttemptAt`),
  INDEX `storage_deletion_user_idx` (`userId`,`status`)
);
