-- AI Swarm Reviews — owner-only dual-panel deep-audit results.
-- Idempotent (CREATE IF NOT EXISTS) to match the hand-written style of
-- migrations 0008-0011; the 0012 snapshot keeps drizzle-kit's diff state
-- in sync with the full schema.
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
CREATE INDEX IF NOT EXISTS `idx_ai_swarm_app` ON `ai_swarm_reviews` (`applicationId`);
