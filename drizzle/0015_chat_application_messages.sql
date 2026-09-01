-- Chatbot conversation persistence + intake channel (chatbot vs traditional).
-- Plain ADD COLUMN (no IF NOT EXISTS) so MySQL 8, MariaDB, and TiDB all accept it.
-- Drizzle's migration journal prevents re-application.
ALTER TABLE `applications` ADD COLUMN `intakeChannel` ENUM('traditional','chatbot') NOT NULL DEFAULT 'traditional';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_application_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`lang` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_application_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_chat_app_messages_application` ON `chat_application_messages` (`applicationId`);
--> statement-breakpoint
CREATE INDEX `idx_chat_app_messages_user` ON `chat_application_messages` (`userId`);
--> statement-breakpoint
CREATE INDEX `idx_chat_app_messages_created` ON `chat_application_messages` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_applications_intakeChannel` ON `applications` (`intakeChannel`);
