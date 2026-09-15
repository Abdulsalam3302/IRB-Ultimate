CREATE TABLE IF NOT EXISTS `email_outbox` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `dedupeKey` varchar(64) NOT NULL UNIQUE,
  `userId` int NOT NULL,
  `recipientHash` varchar(64) NOT NULL,
  `emailCategory` enum('transactional','bulk') NOT NULL,
  `kind` varchar(40) NOT NULL,
  `emailProvider` enum('resend','smtp') NOT NULL,
  `transportHash` varchar(64) NOT NULL,
  `emailStatus` enum('queued','sending','accepted','delivered','bounced','complained','failed','unknown','suppressed','cancelled') NOT NULL DEFAULT 'queued',
  `payload` mediumtext,
  `attempts` int NOT NULL DEFAULT 0,
  `providerId` varchar(255),
  `leaseToken` varchar(36),
  `nextAttemptAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `firstDispatchAt` timestamp NULL,
  `expiresAt` timestamp NOT NULL,
  `acceptedAt` timestamp NULL,
  `deliveredAt` timestamp NULL,
  `lastCode` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `email_outbox_pending_idx` (`emailStatus`,`nextAttemptAt`),
  INDEX `email_outbox_provider_idx` (`providerId`),
  INDEX `email_outbox_user_idx` (`userId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_suppressions` (
  `recipientHash` varchar(64) NOT NULL PRIMARY KEY,
  `allMail` boolean NOT NULL DEFAULT false,
  `reason` varchar(40) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_delivery_events` (
  `id` varchar(255) NOT NULL PRIMARY KEY,
  `providerId` varchar(255) NOT NULL,
  `type` varchar(40) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `email_delivery_provider_idx` (`providerId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_campaigns` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `createdByUserId` int NOT NULL,
  `emailCampaignStatus` enum('preview','queueing','queued','cancelled') NOT NULL DEFAULT 'preview',
  `payload` mediumtext,
  `recipientCount` int NOT NULL,
  `queuedCount` int NOT NULL DEFAULT 0,
  `skippedCount` int NOT NULL DEFAULT 0,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `email_campaign_creator_idx` (`createdByUserId`,`createdAt`)
);
