-- AI Swarm Reviews — owner-only dual-panel deep-audit results.
-- Idempotent to match the hand-written style of migrations 0008-0011; the
-- 0012 snapshot keeps drizzle-kit's diff state in sync with the full schema.
-- NOTE: targets MySQL 8 (production/CI) — no MariaDB-only syntax such as
-- CREATE INDEX IF NOT EXISTS. The index is added via a guarded prepared
-- statement so re-runs and partially-applied databases both converge.
CREATE TABLE IF NOT EXISTS `ai_swarm_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`requestedByUserId` int NOT NULL,
	`runGroup` varchar(32) NOT NULL,
	`panel` int NOT NULL,
	`swarmStatus` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`swarmVerdict` enum('pass','fail'),
	`score` int,
	`report` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `ai_swarm_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @swarm_idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_swarm_reviews'
    AND index_name = 'idx_ai_swarm_app'
);
--> statement-breakpoint
SET @swarm_idx_sql := IF(
  @swarm_idx_exists = 0,
  'CREATE INDEX `idx_ai_swarm_app` ON `ai_swarm_reviews` (`applicationId`)',
  'SELECT 1'
);
--> statement-breakpoint
PREPARE swarm_idx_stmt FROM @swarm_idx_sql;
--> statement-breakpoint
EXECUTE swarm_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE swarm_idx_stmt;
