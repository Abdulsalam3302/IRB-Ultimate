CREATE TABLE `application_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`version` int NOT NULL,
	`snapshot` text NOT NULL,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`stage1AiScore` int,
	`stage2AiScore` int,
	`versionStatus` varchar(64) NOT NULL,
	`changedFields` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `application_versions_id` PRIMARY KEY(`id`)
);
