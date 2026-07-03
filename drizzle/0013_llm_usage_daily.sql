-- LLM usage counters — durable per-user/global daily AI budgets (SA-03).
-- Idempotent, MySQL 8 compatible (matches the hand-written style of
-- migrations 0008-0012). The unique (scope, day) key is what makes the
-- conditional-increment reservation in server/_core/budget.ts atomic.
CREATE TABLE IF NOT EXISTS `llm_usage_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` varchar(80) NOT NULL,
	`day` varchar(10) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_usage_daily_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @llm_usage_uniq_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'llm_usage_daily'
    AND index_name = 'uniq_llm_usage_scope_day'
);
--> statement-breakpoint
SET @llm_usage_uniq_sql := IF(
  @llm_usage_uniq_exists = 0,
  'CREATE UNIQUE INDEX `uniq_llm_usage_scope_day` ON `llm_usage_daily` (`scope`, `day`)',
  'SELECT 1'
);
--> statement-breakpoint
PREPARE llm_usage_uniq_stmt FROM @llm_usage_uniq_sql;
--> statement-breakpoint
EXECUTE llm_usage_uniq_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE llm_usage_uniq_stmt;
