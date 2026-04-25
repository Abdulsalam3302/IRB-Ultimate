CREATE TABLE `research_authors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(64),
	`institution` varchar(255),
	`department` varchar(255),
	`country` varchar(128) DEFAULT 'Saudi Arabia',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_authors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`category` enum('issue','suggestion','question','other') NOT NULL DEFAULT 'question',
	`message` text NOT NULL,
	`userId` int,
	`ticketStatus` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `applications` ADD `questionnaireFileUrl` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `retrospectiveDataSource` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `clinicalTrialDetails` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `supplementaryFilesJson` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `labHeadApproval` boolean;--> statement-breakpoint
ALTER TABLE `applications` ADD `labHeadName` varchar(255);--> statement-breakpoint
ALTER TABLE `applications` ADD `labHeadEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `applications` ADD `labHeadPhone` varchar(64);