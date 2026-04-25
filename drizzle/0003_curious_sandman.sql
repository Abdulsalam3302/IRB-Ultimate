CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`applicationId` int,
	`notifType` enum('application_submitted','ai_review_passed','ai_review_failed','committee_assigned','review_received','admin_approved','admin_rejected','resubmission_required','certificate_issued','review_assignment','review_reminder','general') NOT NULL DEFAULT 'general',
	`notifTitle` varchar(255) NOT NULL,
	`notifMessage` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
