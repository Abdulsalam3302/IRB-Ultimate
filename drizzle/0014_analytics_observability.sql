-- First-party analytics for owner-only open-beta observability.
-- Privacy: ipHash only (HMAC), coarse geo, no precise coordinates.
CREATE TABLE IF NOT EXISTS `analytics_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`userId` int,
	`ipHash` varchar(64),
	`country` varchar(64),
	`region` varchar(96),
	`city` varchar(96),
	`uaClass` varchar(32),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`pageviews` int NOT NULL DEFAULT 0,
	`dwellMs` int NOT NULL DEFAULT 0,
	CONSTRAINT `analytics_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `analytics_sessions_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`path` varchar(255) NOT NULL,
	`eventType` enum('pageview','heartbeat','leave') NOT NULL,
	`dwellMs` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @ae_session_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'analytics_events'
    AND index_name = 'idx_analytics_events_session'
);
--> statement-breakpoint
SET @ae_session_sql := IF(
  @ae_session_idx = 0,
  'CREATE INDEX `idx_analytics_events_session` ON `analytics_events` (`sessionId`)',
  'SELECT 1'
);
--> statement-breakpoint
PREPARE ae_session_stmt FROM @ae_session_sql;
--> statement-breakpoint
EXECUTE ae_session_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE ae_session_stmt;
--> statement-breakpoint
SET @ae_created_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'analytics_events'
    AND index_name = 'idx_analytics_events_created'
);
--> statement-breakpoint
SET @ae_created_sql := IF(
  @ae_created_idx = 0,
  'CREATE INDEX `idx_analytics_events_created` ON `analytics_events` (`createdAt`)',
  'SELECT 1'
);
--> statement-breakpoint
PREPARE ae_created_stmt FROM @ae_created_sql;
--> statement-breakpoint
EXECUTE ae_created_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE ae_created_stmt;
